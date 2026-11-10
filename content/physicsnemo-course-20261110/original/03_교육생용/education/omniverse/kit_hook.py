"""Run with Kit --exec. --verify captures genuine Kit screens and exits."""
import asyncio
import json
from pathlib import Path
import sys
import traceback
import urllib.error

import carb
import omni.kit.app
import omni.ui as ui
import omni.ui.scene as sc
import omni.usd
from omni.kit.viewport.utility import get_active_viewport, get_active_viewport_window, capture_viewport_to_file
from pxr import Gf, Usd, UsdGeom

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'omniverse'))
from client import HookClient
from scene import create_scene, update_scene


class HookViewer:
    def __init__(self):
        self.client = HookClient(carb.settings.get_settings().get('/education/apiUrl') or 'http://127.0.0.1:8098')
        self.surface = None
        self.prediction = None
        self.baseline = None
        self.display = None
        self.case_id = 'case_008'
        self.force_N = 216.780
        self.mode = 'AI'
        self.live = False
        self.ticket = 0
        self.last_timing = {}
        self.peak_view = None
        self.cases = [f'case_{i:03d}' for i in range(1, 11)]
        self.modes = ['AI', 'FEA', 'AbsError', 'DeltaAI']
        self.runs = ['reference', 'student_20261001_171613_019440']
        self.window = ui.Window('Hook Controls and Source', width=465, height=840)
        with self.window.frame:
            with ui.VStack(spacing=6):
                ui.Label('EDUCATIONAL HOOK | FEA + AI', height=30, style={'font_size': 21})
                ui.Label('Geometry: choose prepared thickness case', height=18)
                self.case_combo = ui.ComboBox(7, *self.cases, height=27)
                self.case_combo.model.add_item_changed_fn(self.case_changed)
                with ui.HStack(height=28):
                    ui.Label('Force magnitude [N]')
                    self.force_model = ui.SimpleFloatModel(self.force_N)
                    ui.FloatDrag(self.force_model, min=100, max=500, step=0.1)
                self.force_model.add_value_changed_fn(self.force_changed)
                with ui.HStack(height=28):
                    ui.Button('Nominal force', clicked_fn=lambda: asyncio.ensure_future(self.reset_nominal()))
                    ui.Button('Request AI', clicked_fn=lambda: asyncio.ensure_future(self.refresh()))
                self.mode_combo = ui.ComboBox(0, *self.modes, height=27)
                self.mode_combo.model.add_item_changed_fn(self.mode_changed)
                ui.Label('Model: verified educational training run', height=18)
                self.model_combo = ui.ComboBox(0, *self.runs, height=27)
                ui.Button('Load model + clear caches', height=28, clicked_fn=lambda: asyncio.ensure_future(self.change_model()))
                self.status_label = ui.Label('Connecting...', height=42, word_wrap=True, style={'color': 0xff70c0ff})
                self.conditions_label = ui.Label('', height=38, word_wrap=True)
                self.kpi_label = ui.Label('', height=86, word_wrap=True)
                self.scale_label = ui.Label('', height=54, word_wrap=True)
                self.legend_items = []
                with ui.HStack(height=10, spacing=0):
                    from scene import PALETTE
                    for red, green, blue in PALETTE:
                        color = 0xff000000 | (int(blue*255)<<16) | (int(green*255)<<8) | int(red*255)
                        self.legend_items.append(ui.Rectangle(style={'background_color': color}))
                self.source_label = ui.Label('', height=110, word_wrap=True, style={'font_size': 13})
                self.timing_label = ui.Label('', height=32, word_wrap=True)
                ui.Label('Peak marker: full-node stress maximum.\nSurface colors: corner + midside node triangles.\nYield ratio is illustrative, not a design approval.\nAI underpredicts stress peaks in this exercise.', height=60, word_wrap=True,
                         style={'color': 0xff80bfff})
        # Docking is deferred until the viewport window exists.
        asyncio.ensure_future(self.dock())

    async def dock(self):
        for _ in range(25):
            await omni.kit.app.get_app().next_update_async()
        for _ in range(30):
            viewport_window = ui.Workspace.get_window('Viewport')
            if viewport_window:
                self.window.dock_in(viewport_window, ui.DockPosition.RIGHT, 0.32)
                break
            await omni.kit.app.get_app().next_update_async()

    def stale(self, reason):
        self.live = False
        self.status_label.text = 'STALE / UNAVAILABLE\n' + reason
        self.status_label.style = {'color': 0xff8080ff}
        self.kpi_label.text = 'Previous values unavailable for current request.'
        self.timing_label.text = ''
        self.scale_label.text = 'No current AI result. Retry API request.'
        if self.peak_view is not None:
            self.peak_view.scene.clear()
        for rect in self.legend_items:
            rect.style = {'background_color': 0xff4d4d4d}
        stage = omni.usd.get_context().get_stage()
        if stage and stage.GetPrimAtPath('/World/Hook'):
            mesh = UsdGeom.Mesh.Get(stage, '/World/Hook')
            mesh.GetPrim().SetCustomDataByKey('stale', True)
            mesh.GetDisplayColorPrimvar().Set([Gf.Vec3f(0.3, 0.3, 0.3)] * len(mesh.GetPointsAttr().Get()))
            UsdGeom.Imageable(stage.GetPrimAtPath('/World/Peak')).MakeInvisible()

    def case_changed(self, model, item):
        self.case_id = self.cases[model.get_item_value_model().as_int]
        self.ticket += 1
        self.stale('Geometry selection changed; request nominal result.')

    def force_changed(self, model):
        self.force_N = model.as_float
        self.ticket += 1
        self.stale('Force changed; request AI.')

    def mode_changed(self, model, item):
        self.mode = self.modes[model.get_item_value_model().as_int]
        if self.live:
            try:
                self.draw()
            except ValueError as error:
                self.mode = 'AI'
                self.mode_combo.model.get_item_value_model().set_value(0)
                self.draw()
                self.status_label.text = 'VIEW UNAVAILABLE; showing AI\n' + str(error)

    async def reset_nominal(self):
        try:
            surface = await asyncio.to_thread(self.client.request, '/surface/' + self.case_id)
            self.force_model.set_value(surface['nominal_force_N'])
            # SimpleFloatModel rounds to float32. Preserve the authoritative exact nominal value.
            self.force_N = surface['nominal_force_N']
            await self.refresh()
        except Exception as error:
            self.stale(str(error))

    async def change_model(self):
        self.ticket += 1
        self.stale('Model switching...')
        run = self.runs[self.model_combo.model.get_item_value_model().as_int]
        try:
            await asyncio.to_thread(self.client.select_model, run)
            await self.refresh()
        except Exception as error:
            self.stale(str(error))

    async def refresh(self):
        self.ticket += 1
        token = self.ticket
        case_id, force_N = self.case_id, self.force_N
        self.stale('Request in progress...')
        try:
            surface, prediction, timing = await asyncio.to_thread(self.client.fetch, case_id, force_N)
            baseline = None
            if not prediction['matching_fea']:
                _, baseline, _ = await asyncio.to_thread(self.client.fetch, case_id, surface['nominal_force_N'])
                if baseline['model_id'] != prediction['model_id'] or baseline['generation'] != prediction['generation']:
                    raise RuntimeError('Model changed while requesting baseline')
            if token != self.ticket:
                return
            stage = omni.usd.get_context().get_stage()
            if self.surface is None or self.surface['surface_version'] != surface['surface_version']:
                await omni.usd.get_context().new_stage_async()
                stage = omni.usd.get_context().get_stage()
                create_scene(stage, surface)
                viewport = get_active_viewport()
                viewport.camera_path = '/World/Camera'
            self.surface, self.prediction, self.baseline = surface, prediction, baseline
            self.last_timing = timing
            self.live = True
            if not prediction['matching_fea'] and self.mode in ('FEA', 'AbsError'):
                self.mode = 'AI'
                self.mode_combo.model.get_item_value_model().set_value(0)
            self.draw()
        except Exception as error:
            if token == self.ticket:
                if isinstance(error, urllib.error.URLError) and not isinstance(error, urllib.error.HTTPError):
                    code = getattr(error.reason, 'winerror', None) or getattr(error.reason, 'errno', None)
                    self.stale('API connection unavailable; check server. Error code: ' + str(code))
                else:
                    self.stale(type(error).__name__ + ': ' + str(error))
            carb.log_error(traceback.format_exc())

    def draw(self):
        p, s = self.prediction, self.surface
        stage = omni.usd.get_context().get_stage()
        self.display = update_scene(stage, s, p, self.mode, self.baseline)
        # The full-node maximum may lie inside the solid. Project the exact
        # world coordinate into a viewport overlay, so it is never occluded.
        if self.peak_view is None:
            with get_active_viewport_window().get_frame('educational_peak_overlay'):
                self.peak_view = sc.SceneView(aspect_ratio_policy=sc.AspectRatioPolicy.STRETCH)
            get_active_viewport().add_scene_view(self.peak_view)
        self.peak_view.scene.clear()
        with self.peak_view.scene:
            position = self.display['marker_position_mm']
            sc.Points([position], colors=[[1, 1, 1, 1]], sizes=[18])
            sc.Points([position], colors=[[1, 0.15, 0.85, 1]], sizes=[12])
        from scene import colors
        display_colors = colors([-1, -.5, 0, .5, 1], -1, 1, self.mode == 'DeltaAI')
        for rect, vector in zip(self.legend_items, display_colors):
            red, green, blue = vector
            rect.style = {'background_color': 0xff000000 | (int(blue*255)<<16) | (int(green*255)<<8) | int(red*255)}
        UsdGeom.Imageable(stage.GetPrimAtPath('/World/Peak')).MakeVisible()
        self.status_label.text = 'LIVE | ' + p['comparison_kind']
        self.status_label.style = {'color': 0xffb0e0ff}
        self.conditions_label.text = f"{p['case_id']} | thickness {p['thickness_mm']:.3f} mm\nForce {p['force_N']:.6f} N | fixed direction"
        fea_ratio = f"{p['fea_illustrative_yield_ratio']:.3f}" if p['matching_fea'] else 'N/A (no matching FEA)'
        self.kpi_label.text = (f"AI full-node max stress: {p['full_max_stress_mpa']:.3f} MPa\n"
                               f"AI full-node max displacement: {p['full_max_displacement_mm']:.6f} mm\n"
                               f"AI yield/max ratio: {p['illustrative_yield_ratio']:.3f}\n"
                               f"FEA yield/max ratio: {fea_ratio}\nYield: {p['yield_strength_mpa']:.1f} MPa (MatML)")
        d = self.display
        self.scale_label.text = f"{d['title']}\nRange {d['color_min_mpa']:.3f} .. {d['color_max_mpa']:.3f} MPa\nColor-clipped surface nodes: {d['color_clipped_nodes']}"
        self.source_label.text = (f"Model (epoch {p['selected_epoch']}):\n{p['model_id']}\n"
                                  f"Surface:\n{p['surface_version']}\nStats: {p['stats_sha256'][:24]}...")
        self.timing_label.text = (f"HTTP {self.last_timing['http_ms']:.2f} ms | client hit {self.last_timing['client_cache_hit']}\n"
                                  f"Server {p['server_ms']:.2f} ms | API hit {p['cache_hit']}")


async def verify(viewer):
    output = ROOT / 'runs/visualization/kit'
    output.mkdir(parents=True, exist_ok=True)
    report = {'passed': False, 'actual_kit_execution': True, 'captures': [], 'states': [], 'error': None}
    async def capture(name):
        for _ in range(50):
            await omni.kit.app.get_app().next_update_async()
        stage = omni.usd.get_context().get_stage()
        stage.Export(str(output / (name + '.usda')))
        reopened = Usd.Stage.Open(str(output / (name + '.usda')))
        assert UsdGeom.GetStageMetersPerUnit(reopened) == 0.001
        mesh = UsdGeom.Mesh.Get(reopened, '/World/Hook')
        assert len(mesh.GetDisplayColorPrimvar().Get()) == len(viewer.surface['node_ids'])
        assert mesh.GetDisplayColorPrimvar().GetInterpolation() == 'vertex'
        viewport_file = output / (name + '_viewport.png')
        result = capture_viewport_to_file(get_active_viewport(), str(viewport_file))
        await result.wait_for_result()
        from omni.kit.renderer_capture import acquire_renderer_capture_interface
        interface = acquire_renderer_capture_interface()
        screen_file = output / (name + '_screen.png')
        interface.capture_next_frame_swapchain(str(screen_file))
        for _ in range(30):
            await omni.kit.app.get_app().next_update_async()
        assert viewport_file.is_file() and screen_file.is_file()
        import hashlib
        def digest(path):
            return hashlib.sha256(path.read_bytes()).hexdigest()
        if report['captures']:
            assert digest(viewport_file) != report['captures'][-1]['viewport_sha256'], 'Viewport did not change; inspect actual render'
        report['captures'].append({'name': name, 'viewport': str(viewport_file), 'screen': str(screen_file),
                                   'usd': str(output / (name + '.usda')),
                                   'viewport_sha256': digest(viewport_file), 'screen_sha256': digest(screen_file),
                                   'usd_sha256': digest(output / (name + '.usda'))})
        report['states'].append({'name': name, 'live': viewer.live, 'status': viewer.status_label.text,
                                 'kpi': viewer.kpi_label.text, 'source': viewer.source_label.text,
                                 'model_id': viewer.prediction['model_id'], 'force_N': viewer.prediction['force_N'],
                                 'surface_version': viewer.surface['surface_version'], 'display': viewer.display})
        report['states'][-1]['marker_policy'] = 'exact full-node maximum projected in a viewport overlay, visible through geometry when live'
    try:
        await viewer.refresh()
        assert viewer.live
        for mode in ['FEA', 'AI', 'AbsError']:
            viewer.mode_combo.model.get_item_value_model().set_value(viewer.modes.index(mode))
            viewer.mode = mode
            viewer.draw()
            await capture('nominal_' + mode)
        original_model = viewer.prediction['model_id']
        viewer.case_combo.model.get_item_value_model().set_value(0)
        viewer.force_model.set_value(377.9171)
        viewer.case_id, viewer.force_N = 'case_001', 377.9171
        viewer.mode_combo.model.get_item_value_model().set_value(3)
        viewer.mode = 'DeltaAI'
        await viewer.refresh()
        assert viewer.live and not viewer.prediction['matching_fea']
        await capture('changed_force_DeltaAI')
        await viewer.refresh()
        assert viewer.last_timing['client_cache_hit']
        report['repeat_client_cache_hit'] = True
        viewer.model_combo.model.get_item_value_model().set_value(1)
        await viewer.change_model()
        assert viewer.live and viewer.prediction['model_id'] != original_model
        assert not viewer.last_timing['client_cache_hit']
        await capture('student_model')
        report['model_switch_invalidated_client_cache'] = True
        previous_url = viewer.client.base_url
        viewer.client.base_url = 'http://127.0.0.1:1'
        await viewer.refresh()
        assert not viewer.live
        assert omni.usd.get_context().get_stage().GetPrimAtPath('/World/Hook').GetCustomDataByKey('stale')
        await capture('connection_failure')
        viewer.client.base_url = previous_url
        await asyncio.to_thread(viewer.client.select_model, 'reference')
        report['failure_has_no_prediction_fallback'] = True
        import hashlib
        report['source_code_sha256'] = {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest()
                                        for name in ['omniverse/kit_hook.py', 'omniverse/scene.py',
                                                     'omniverse/client.py', 'omniverse/education_hook.kit']}
        report['kit_version'] = omni.kit.app.get_app().get_build_version()
        report['passed'] = True
    except Exception:
        report['error'] = traceback.format_exc()
        carb.log_error(report['error'])
    finally:
        (ROOT / 'reports/kit_visualization_check.json').write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding='utf-8')
        omni.kit.app.get_app().post_quit(0 if report['passed'] else 1)


VIEWER = HookViewer()
if '--verify' in sys.argv:
    TASK = asyncio.ensure_future(verify(VIEWER))
else:
    TASK = asyncio.ensure_future(VIEWER.refresh())
