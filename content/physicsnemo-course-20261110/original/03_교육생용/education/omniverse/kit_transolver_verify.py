"""Exercise the actual chapter 8 UI callbacks and native USD/RTX renderer."""
import json
import asyncio
import threading
import time
from pathlib import Path
import traceback
import carb
import omni.kit.app
import omni.usd
from pxr import Gf, Usd, UsdGeom, UsdShade
from kit_transolver_capture import capture_result, digest


async def verify(viewer):
    report = dict(passed=False,actual_kit_execution=True,captures=[],error=None)
    output = viewer.output_dir
    async def snapshot(name):
        record = await capture_result(viewer,output,name)
        stage = Usd.Stage.Open(record['paths']['usd'])
        assert UsdGeom.GetStageMetersPerUnit(stage)==.001
        mesh = UsdGeom.Mesh.Get(stage,'/World/Hook')
        points = mesh.GetPointsAttr().Get()
        if viewer.live:
            assert str(UsdShade.MaterialBindingAPI(mesh.GetPrim()).ComputeBoundMaterial()[0].GetPath())=='/World/FieldMaterial'
            assert abs(max(p[2] for p in points)-min(p[2] for p in points)-viewer.thickness_mm)<1e-5
            assert len(points)==len(viewer.prediction['node_ids'])
            assert mesh.GetPrim().GetCustomDataByKey('modelId')==viewer.expected_model_id
            assert not mesh.GetPrim().GetCustomDataByKey('stale')
            actual = mesh.GetPrim().GetAttribute('education:displayValues').Get()
            if viewer.mode in ('AI','Displacement'):
                from scene import colors
                expected = viewer.prediction['stress_mpa'] if viewer.mode=='AI' else [sum(float(v)**2 for v in u)**.5 for u in viewer.prediction['displacement_mm']]
                assert max(abs(float(a)-b) for a,b in zip(actual,expected))<1e-4
                rgba = mesh.GetDisplayColorPrimvar().Get()
                rgb = colors(expected,viewer.display['color_min'],viewer.display['color_max'])
                assert max(abs(float(a[k])-b[k]) for a,b in zip(rgba,rgb) for k in range(3))<1e-6
            assert not mesh.GetPrim().GetCustomDataByKey('displacementApplied')
        else:
            assert str(UsdShade.MaterialBindingAPI(mesh.GetPrim()).ComputeBoundMaterial()[0].GetPath())=='/World/UnavailableMaterial'
            assert mesh.GetPrim().GetCustomDataByKey('stale')
            assert 'No current result' in viewer.kpi_label.text
            assert all(max(abs(float(c[k])-.3) for k in range(3))<1e-6 for c in mesh.GetDisplayColorPrimvar().Get())
            assert not UsdGeom.Imageable(stage.GetPrimAtPath('/World/Peak')).ComputeVisibility()=='inherited'
        report['captures'].append(record)
    async def request(thickness,force,mode='AI'):
        viewer.mode_combo.model.get_item_value_model().set_value(viewer.modes.index(mode))
        viewer.mode=mode
        index=viewer.comparison_conditions.index((thickness,force))
        viewer.condition_combo.model.get_item_value_model().set_value(index)
        await viewer.apply_comparison_condition()
        assert viewer.live,viewer.status_label.text
        assert abs(viewer.prediction['thickness_mm']-thickness)<1e-5
        assert abs(viewer.prediction['force_N']-force)<1e-3
        if index == 0:
            assert viewer.prediction['matching_fea']
        assert viewer.prediction['model_id']==viewer.expected_model_id
    try:
        await request(viewer.reference_thickness_mm,viewer.reference_force_N)
        assert viewer.live,viewer.status_label.text
        original_stage = omni.usd.get_context().get_stage()
        original_layer = original_stage.GetRootLayer().identifier
        assert viewer.request_runner.delay_seconds == 0.
        report['slider_requests_have_no_debounce_delay'] = True
        await snapshot('first_stress')
        await snapshot('comparison_controls')
        await viewer.save_result()
        assert viewer.saved_label.text.startswith('Saved:')
        viewer.mode_combo.model.get_item_value_model().set_value(1)
        assert viewer.mode=='Displacement'
        assert viewer.display['marker_position_mm']==viewer.prediction['full_displacement_peak_position_mm']
        await snapshot('first_displacement')
        # Slider edits use the real HTTP client, without pressing Request AI.
        original_fetch = viewer.client.fetch_conditions
        fetches = []
        active = 0
        maximum_active = 0
        slow_next = False
        entered = threading.Event()
        def observed_fetch(thickness, force):
            nonlocal active, maximum_active, slow_next
            active += 1
            maximum_active = max(maximum_active, active)
            fetches.append((thickness, force))
            try:
                if slow_next:
                    slow_next = False
                    entered.set()
                    time.sleep(.4)
                return original_fetch(thickness, force)
            finally:
                active -= 1
        viewer.client.fetch_conditions = observed_fetch
        try:
            assert viewer.auto_model.as_bool
            for i in range(18):
                viewer.thickness_model.set_value(6.2+i*.1)
                await asyncio.sleep(.01)
            viewer.force_model.set_value(315.)
            await viewer.request_runner.wait_idle()
            assert viewer.live and abs(viewer.prediction['thickness_mm']-7.9)<1e-5
            assert viewer.prediction['force_N']==315.
            assert fetches and maximum_active == 1,fetches
            report['rapid_slider_edits_keep_latest_and_one_inflight']=True
            fetches.clear()
            slow_next = True
            viewer.thickness_model.set_value(9.)
            deadline=time.monotonic()+10
            while not entered.is_set():
                if time.monotonic()>deadline:raise TimeoutError('Automatic request did not start')
                await asyncio.sleep(.01)
            drawn=[]
            original_draw=viewer.draw
            def observed_draw():
                drawn.append((viewer.prediction['thickness_mm'],viewer.prediction['force_N']))
                original_draw()
            viewer.draw=observed_draw
            try:
                viewer.thickness_model.set_value(10.5)
                viewer.force_model.set_value(365.)
                await viewer.request_runner.wait_idle()
            finally:
                viewer.draw=original_draw
            assert viewer.live and drawn==[(10.5,365.)],drawn
            assert len(fetches)==2 and maximum_active==1,fetches
            report['inflight_old_response_not_displayed']=True
            report['maximum_concurrent_slider_requests']=maximum_active
            await snapshot('automatic_slider_latest')
        finally:
            viewer.client.fetch_conditions=original_fetch
        # Keep manual mode available for comparison and deterministic stale capture.
        viewer.auto_model.set_value(False)
        viewer.thickness_model.set_value(6.)
        assert not viewer.live
        await snapshot('input_changed')
        viewer.auto_model.set_value(True)
        viewer.set_camera(True)
        for thickness in [6.,12.]:
            await request(thickness,viewer.reference_force_N)
            assert omni.usd.get_context().get_stage().GetRootLayer().identifier == original_layer
            assert not viewer.prediction['inside_training_hull']
            await snapshot('thickness_'+str(int(thickness))+'_stress')
            await viewer.save_result()
            assert viewer.saved_label.text.startswith('Saved:')
            viewer.mode_combo.model.get_item_value_model().set_value(1)
            await snapshot('thickness_'+str(int(thickness))+'_displacement')
        viewer.set_camera(False)
        for name,force in [('load_reference',viewer.reference_force_N),('load_400',400.)]:
            await request(viewer.reference_thickness_mm,force)
            await snapshot(name)
            await viewer.save_result()
            assert viewer.saved_label.text.startswith('Saved:')
        report['all_four_comparison_presets_checked']=True
        report['thickness_changes_reuse_original_usd_stage']=True
        _, _, cache_info = await asyncio.to_thread(viewer.client.fetch_conditions,
            viewer.thickness_mm, viewer.force_N)
        assert cache_info['client_cache_hit']
        report['same_condition_client_cache_checked']=True
        # Wrong FEA condition must not render an invented error field.
        viewer.mode_combo.model.get_item_value_model().set_value(viewer.modes.index('AbsError'))
        assert viewer.mode=='AI'
        assert 'VIEW UNAVAILABLE' in viewer.status_label.text
        report['unmatched_fea_view_rejected']=True
        prior=viewer.client.base_url
        viewer.client.base_url='http://127.0.0.1:1'
        await viewer.refresh()
        assert not viewer.live
        await snapshot('connection_failure')
        viewer.client.base_url=prior
        await viewer.refresh()
        assert viewer.live
        await snapshot('connection_recovered')
        # Exercise the learner's actual Save result callback too.
        await viewer.save_result()
        assert viewer.saved_label.text.startswith('Saved:')
        report['save_button_completed']=True
        stress=[r for r in report['captures'] if r['name'] in ('thickness_6_stress','thickness_12_stress')]
        disp=[r for r in report['captures'] if r['name'] in ('thickness_6_displacement','thickness_12_displacement')]
        assert len(stress)==len(disp)==2
        for records in [stress,disp]:
            assert records[0]['display']['color_min']==records[1]['display']['color_min']
            assert records[0]['display']['color_max']==records[1]['display']['color_max']
            stages=[Usd.Stage.Open(r['paths']['usd']) for r in records]
            assert UsdGeom.Xformable(stages[0].GetPrimAtPath('/World/Camera')).GetLocalTransformation()==UsdGeom.Xformable(stages[1].GetPrimAtPath('/World/Camera')).GetLocalTransformation()
        report.update(passed=True,kit_version=omni.kit.app.get_app().get_build_version(),
                      fixed_camera_and_color_scale_checked=True,actual_morphed_thickness_checked=True,
                      displacement_magnitude_colors_checked=True,full_node_peak_metadata_checked=True,
                      stale_has_no_current_values=True,failure_recovery_checked=True,
                      unavailable_shape_uses_constant_gray_material=True,
                      original_chapter6_model=viewer.expected_model_id,
                      accuracy_status='Visualization and delivery checked; new-condition ANSYS accuracy not evaluated')
        root=Path(__file__).resolve().parents[1]
        report['source_code_sha256']={name:digest(root/name) for name in ['omniverse/kit_transolver.py',
            'omniverse/scene_transolver.py','omniverse/scene.py','omniverse/client.py',
            'omniverse/kit_transolver_verify.py','omniverse/kit_transolver_capture.py','omniverse/latest_request.py']}
    except Exception:
        report['error']=traceback.format_exc()
        carb.log_error(report['error'])
    finally:
        (output/'kit_check.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        omni.kit.app.get_app().post_quit(0 if report['passed'] else 1)
