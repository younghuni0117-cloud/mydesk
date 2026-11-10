"""Live chapter 8 viewer. Executed by Kit with its own Python runtime."""
import asyncio
from datetime import datetime
import json
from pathlib import Path
import sys
import traceback

import carb
import omni.kit.app
import omni.ui as ui
import omni.ui.scene as sc
import omni.usd
from omni.kit.viewport.utility import get_active_viewport, get_active_viewport_window
from pxr import Gf, UsdGeom

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'omniverse'))
from client import HookClient
from latest_request import LatestRequestRunner
from scene import colors, PALETTE
from scene_transolver import create_scene, update_scene, mark_scene_stale


class HookViewer:
    def __init__(self):
        settings = carb.settings.get_settings()
        self.client = HookClient(settings.get('/education/apiUrl') or 'http://127.0.0.1:8098')
        health = self.client.request('/health')
        if health.get('api_kind') != 'live_transolver' or health.get('geometry_mode') != 'continuous_thickness_morphing':
            raise RuntimeError('Start the continuous-thickness chapter 7 server')
        self.expected_model_id = settings.get('/education/expectedModelId') or health['model_id']
        if self.expected_model_id != health['model_id']:
            raise RuntimeError('The server differs from the Chapter 7 model')
        catalog = self.client.request('/geometries')
        self.reference_thickness_mm = catalog['reference_thickness_mm']
        self.reference_force_N = catalog['nominal_force_N']
        self.comparison_conditions = [(self.reference_thickness_mm, self.reference_force_N),
                                      (6., self.reference_force_N), (12., self.reference_force_N),
                                      (self.reference_thickness_mm, 400.)]
        self.thickness_mm, self.force_N = self.reference_thickness_mm, self.reference_force_N
        self.surface = self.prediction = self.baseline = self.display = None
        self.mode, self.live, self.ticket = 'AI', False, 0
        self.request_runner = LatestRequestRunner(self._refresh_once, delay_seconds=0.)
        self.modes = ['AI', 'Displacement', 'FEA', 'AbsError', 'DeltaAI']
        self.mode_labels = ['AI stress [MPa]', 'AI displacement magnitude [mm]',
                            'Optional: ANSYS stress', 'Optional: absolute stress error', 'Optional: load response']
        self.last_timing, self.side_view = {}, False
        self.peak_view = None
        self.output_dir = Path(settings.get('/education/outputDir') or
                               ROOT/'runs/visualization'/('student_transolver_'+datetime.now().strftime('%Y%m%d_%H%M%S_%f')))
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.window = ui.Window('Hook AI - Conditions and Results', width=465, height=880)
        with self.window.frame:
            with ui.VStack(spacing=5):
                ui.Label('HOOK AI | THICKNESS + FORCE', height=26, style={'font_size':20})
                with ui.HStack(height=25):
                    ui.Label('Thickness [mm] 6..12', width=220)
                    self.thickness_model = ui.SimpleFloatModel(self.thickness_mm)
                    ui.FloatSlider(self.thickness_model, min=6, max=12, step=.01, precision=3)
                self.thickness_model.add_value_changed_fn(self.thickness_changed)
                with ui.HStack(height=25):
                    ui.Label('Force [N] 100..500', width=220)
                    self.force_model = ui.SimpleFloatModel(self.force_N)
                    ui.FloatSlider(self.force_model, min=100, max=500, step=.1, precision=3)
                self.force_model.add_value_changed_fn(self.force_changed)
                self.auto_model = ui.SimpleBoolModel(True)
                with ui.HStack(height=23):
                    ui.CheckBox(self.auto_model, width=25)
                    ui.Label('Auto update on slider change')
                self.auto_model.add_value_changed_fn(self.auto_changed)
                with ui.HStack(height=27):
                    ui.Button('Reference force', clicked_fn=lambda: asyncio.ensure_future(self.reset_nominal()))
                    ui.Button('Request AI', clicked_fn=lambda: asyncio.ensure_future(self.refresh()))
                with ui.CollapsableFrame('Comparison conditions (exact values)', collapsed=False):
                    with ui.HStack(height=27):
                        self.condition_combo = ui.ComboBox(0, 'Reference: 10.25 mm / 343.561 N',
                            'Thin: 6 mm / 343.561 N', 'Thick: 12 mm / 343.561 N',
                            'Higher force: 10.25 mm / 400 N')
                        ui.Button('Apply', width=62,
                                  clicked_fn=lambda: asyncio.ensure_future(self.apply_comparison_condition()))
                with ui.HStack(height=25):
                    ui.Label('Display result', width=100)
                    self.mode_combo = ui.ComboBox(0, *self.mode_labels)
                self.mode_combo.model.add_item_changed_fn(self.mode_changed)
                self.fixed_model = ui.SimpleBoolModel(True)
                with ui.HStack(height=23):
                    ui.CheckBox(self.fixed_model, width=25)
                    ui.Label('Fixed color scale for comparisons')
                self.fixed_model.add_value_changed_fn(lambda _: self.redraw())
                self.stress_scale = ui.SimpleFloatModel(200.)
                self.displacement_scale = ui.SimpleFloatModel(1.2)
                with ui.HStack(height=24):
                    ui.Label('Stress scale max [MPa]', width=220)
                    ui.FloatDrag(self.stress_scale, min=.001, max=10000, step=1)
                with ui.HStack(height=24):
                    ui.Label('Displacement scale max [mm]', width=220)
                    ui.FloatDrag(self.displacement_scale, min=.000001, max=100, step=.01)
                self.stress_scale.add_value_changed_fn(lambda _: self.redraw())
                self.displacement_scale.add_value_changed_fn(lambda _: self.redraw())
                with ui.HStack(height=26):
                    ui.Button('Front view', clicked_fn=lambda: self.set_camera(False))
                    ui.Button('Side view', clicked_fn=lambda: self.set_camera(True))
                    ui.Button('Save result', clicked_fn=lambda: asyncio.ensure_future(self.save_result()))
                self.status_label = ui.Label('Connecting...', height=45, word_wrap=True)
                self.conditions_label = ui.Label('', height=36, word_wrap=True)
                self.kpi_label = ui.Label('', height=60, word_wrap=True)
                self.peak_label = ui.Label('', height=56, word_wrap=True)
                self.scale_label = ui.Label('', height=56, word_wrap=True)
                self.legend_items = []
                with ui.HStack(height=11, spacing=0):
                    for red, green, blue in PALETTE:
                        color = 0xff000000 | (int(blue*255)<<16) | (int(green*255)<<8) | int(red*255)
                        self.legend_items.append(ui.Rectangle(style={'background_color':color}))
                ui.Label('Geometry is morphed to the requested thickness.\nPredicted displacement is shown as color, not added to coordinates.',
                         height=40, word_wrap=True)
                with ui.CollapsableFrame('Source and optional comparison details', collapsed=True):
                    with ui.VStack(spacing=4):
                        self.source_label = ui.Label('', height=100, word_wrap=True)
                        self.timing_label = ui.Label('', height=28, word_wrap=True)
                        ui.Label('Model fixed to Chapters 6-7. ANSYS/error views need matching data.\nLoad response compares AI results at the same thickness.', height=44, word_wrap=True)
                self.saved_label = ui.Label('', height=48, word_wrap=True)
        asyncio.ensure_future(self.dock())

    async def dock(self):
        for _ in range(25):
            await omni.kit.app.get_app().next_update_async()
        for _ in range(30):
            viewport = ui.Workspace.get_window('Viewport')
            if viewport:
                self.window.dock_in(viewport, ui.DockPosition.RIGHT, .34)
                break
            await omni.kit.app.get_app().next_update_async()

    def stale(self, reason):
        was_live = self.live
        self.live = False
        self.status_label.text = 'STALE / UNAVAILABLE\n'+reason
        self.status_label.style = {'color':0xff8080ff}
        self.kpi_label.text = 'No current result. Waiting for the latest input.'
        self.conditions_label.text = f'Requested: {self.thickness_mm:.3f} mm | {self.force_N:.3f} N'
        self.peak_label.text = ''
        self.scale_label.text = ''
        self.timing_label.text = ''
        self.saved_label.text = ''
        if self.peak_view is not None:
            self.peak_view.scene.clear()
        for rect in self.legend_items:
            rect.style = {'background_color':0xff4d4d4d}
        stage = omni.usd.get_context().get_stage()
        if was_live and stage and stage.GetPrimAtPath('/World/Hook'):
            mark_scene_stale(stage)
            UsdGeom.Imageable(stage.GetPrimAtPath('/World/Peak')).MakeInvisible()

    def thickness_changed(self, model):
        self.thickness_mm = model.as_float
        self.ticket += 1
        self.stale('Thickness changed; waiting for automatic request.' if self.auto_model.as_bool else 'Thickness changed; press Request AI.')
        if self.auto_model.as_bool:
            self.request_runner.submit()

    def force_changed(self, model):
        self.force_N = model.as_float
        self.ticket += 1
        self.stale('Force changed; waiting for automatic request.' if self.auto_model.as_bool else 'Force changed; press Request AI.')
        if self.auto_model.as_bool:
            self.request_runner.submit()

    def auto_changed(self, model):
        if model.as_bool:
            if not self.live:
                self.request_runner.submit()
        else:
            self.request_runner.cancel_pending()

    async def apply_comparison_condition(self):
        index = self.condition_combo.model.get_item_value_model().as_int
        thickness, force = self.comparison_conditions[index]
        self.thickness_model.set_value(thickness)
        self.force_model.set_value(force)
        # Keep the catalog's exact reference values for same-condition FEA matching.
        self.thickness_mm, self.force_N = thickness, force
        await self.refresh()

    def mode_changed(self, model, item):
        self.mode = self.modes[model.get_item_value_model().as_int]
        if self.live and self.mode == 'DeltaAI' and self.baseline is None:
            asyncio.ensure_future(self.refresh())
        else:
            self.redraw()

    def redraw(self):
        if not self.live:
            return
        try:
            self.draw()
        except ValueError as error:
            self.mode = 'AI'
            self.mode_combo.model.get_item_value_model().set_value(0)
            self.draw()
            self.status_label.text = 'VIEW UNAVAILABLE; showing AI stress\n'+str(error)

    async def reset_nominal(self):
        self.force_model.set_value(self.reference_force_N)
        self.force_N = self.reference_force_N
        await self.refresh()

    def set_camera(self, side):
        self.side_view = side
        stage = omni.usd.get_context().get_stage()
        if stage and stage.GetPrimAtPath('/World/Camera'):
            camera = UsdGeom.Camera.Get(stage, '/World/Camera')
            position = Gf.Vec3d(125,-180,60) if side else Gf.Vec3d(115,-145,340)
            up = Gf.Vec3d(0,0,1) if side else Gf.Vec3d(0,1,0)
            view = Gf.Matrix4d().SetLookAt(position, Gf.Vec3d(0,17,6), up)
            UsdGeom.Xformable(camera).GetOrderedXformOps()[0].Set(view.GetInverse())

    async def refresh(self):
        self.ticket += 1
        self.request_runner.submit(immediate=True)
        await self.request_runner.wait_idle()

    async def _refresh_once(self):
        token = self.ticket
        thickness, force = self.thickness_mm, self.force_N
        self.stale('Request in progress...')
        try:
            surface, prediction, timing = await asyncio.to_thread(self.client.fetch_conditions, thickness, force)
            if prediction['model_id'] != self.expected_model_id:
                raise RuntimeError('The server model differs from Chapters 6-7')
            baseline = None
            if self.mode == 'DeltaAI':
                _, baseline, _ = await asyncio.to_thread(self.client.fetch_conditions, thickness, self.reference_force_N)
                if baseline['model_id'] != prediction['model_id'] or baseline['surface_version'] != prediction['surface_version']:
                    raise RuntimeError('Baseline source differs')
            if token != self.ticket:
                return
            stage = omni.usd.get_context().get_stage()
            if stage is None or not stage.GetPrimAtPath('/World/Hook'):
                await omni.usd.get_context().new_stage_async()
                if token != self.ticket:
                    return
                create_scene(omni.usd.get_context().get_stage(), surface)
                get_active_viewport().camera_path = '/World/Camera'
                self.set_camera(self.side_view)
            else:
                mesh = UsdGeom.Mesh.Get(stage, '/World/Hook')
                if (list(mesh.GetPrim().GetAttribute('education:nodeIds').Get()) != surface['node_ids'] or
                    list(mesh.GetFaceVertexIndicesAttr().Get()) != [i for face in surface['triangles'] for i in face]):
                    raise RuntimeError('Surface connectivity changed; reconnect the viewer')
                if self.surface is None or self.surface['surface_version'] != surface['surface_version']:
                    mesh.GetPointsAttr().Set([Gf.Vec3f(*point) for point in surface['points_mm']])
            self.surface, self.prediction, self.baseline = surface, prediction, baseline
            self.last_timing, self.live = timing, True
            if not prediction['matching_fea'] and self.mode in ('FEA','AbsError'):
                self.mode = 'AI'
                self.mode_combo.model.get_item_value_model().set_value(0)
            self.draw()
        except Exception as error:
            if token == self.ticket:
                self.stale(type(error).__name__+': '+str(error))
            carb.log_error(traceback.format_exc())

    def draw(self):
        p, s = self.prediction, self.surface
        limits = {'AI':(0.,self.stress_scale.as_float), 'Displacement':(0.,self.displacement_scale.as_float)} if self.fixed_model.as_bool else None
        stage = omni.usd.get_context().get_stage()
        self.display = update_scene(stage,s,p,self.mode,self.baseline,limits)
        if self.peak_view is None:
            with get_active_viewport_window().get_frame('educational_peak_overlay'):
                self.peak_view = sc.SceneView(aspect_ratio_policy=sc.AspectRatioPolicy.STRETCH)
            get_active_viewport().add_scene_view(self.peak_view)
        self.peak_view.scene.clear()
        with self.peak_view.scene:
            position = self.display['marker_position_mm']
            sc.Points([position],colors=[[1,1,1,1]],sizes=[18])
            sc.Points([position],colors=[[1,.15,.85,1]],sizes=[12])
        for rect, vector in zip(self.legend_items,colors([-1,-.5,0,.5,1],-1,1,self.mode=='DeltaAI')):
            red,green,blue = vector
            rect.style = {'background_color':0xff000000|(int(blue*255)<<16)|(int(green*255)<<8)|int(red*255)}
        UsdGeom.Imageable(stage.GetPrimAtPath('/World/Peak')).MakeVisible()
        self.status_label.text = 'LIVE | '+p['condition_scope']+'\nCurrent response displayed; accuracy is evaluated in Chapter 6.'
        self.status_label.style = {'color':0xffb0e0ff}
        self.conditions_label.text = f"Thickness {p['thickness_mm']:.3f} mm | Force {p['force_N']:.6f} N\nFixed load direction | model epoch {p['selected_epoch']}"
        self.kpi_label.text = (f"Full-node max stress: {p['full_max_stress_mpa']:.3f} MPa\n"
                               f"Full-node max displacement magnitude: {p['full_max_displacement_mm']:.6f} mm")
        d = self.display
        self.peak_label.text = f"Marker: {d['marker_meaning']}\nPosition [mm]: "+', '.join(f'{v:.3f}' for v in d['marker_position_mm'])
        self.scale_label.text = f"{d['title']}\nRange {d['color_min']:.3f} .. {d['color_max']:.3f} {d['unit']} | clipped nodes: {d['color_clipped_nodes']}"
        self.source_label.text = f"Model: {p['model_id']}\nSurface: {p['surface_version']}\nStats: {p['stats_sha256'][:24]}..."
        self.timing_label.text = f"HTTP {self.last_timing['http_ms']:.1f} ms | server {p['server_ms']:.1f} ms"

    async def save_result(self):
        if not self.live:
            self.saved_label.text = 'Wait for LIVE before saving. Use Request AI to retry if needed.'
            return
        from kit_transolver_capture import capture_result
        folder = self.output_dir/datetime.now().strftime('result_%Y%m%d_%H%M%S_%f')
        folder.mkdir(parents=True, exist_ok=False)
        # Freeze values before awaiting a frame; a new input must not mix with the capture.
        ticket = self.ticket
        try:
            record = await capture_result(self,folder,'result',ticket)
            self.saved_label.text = 'Saved: '+str(folder)
        except Exception as error:
            self.saved_label.text = 'Save failed: '+str(error)


try:
    VIEWER = HookViewer()
    if '--verify' in sys.argv:
        from kit_transolver_verify import verify
        TASK = asyncio.ensure_future(verify(VIEWER))
    else:
        TASK = asyncio.ensure_future(VIEWER.refresh())
except Exception:
    carb.log_error(traceback.format_exc())
    omni.kit.app.get_app().post_quit(1)
