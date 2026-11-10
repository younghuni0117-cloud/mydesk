"""Tiny synthetic USD scene for chapter 1; no model, API or FEA data is used."""
import asyncio
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sys
import traceback

import omni.kit.app
import omni.ui as ui
import omni.usd
from omni.kit.viewport.utility import get_active_viewport, get_active_viewport_window, capture_viewport_to_file
from pxr import Gf, Sdf, UsdGeom, UsdShade

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / 'reports/kit_basic_startup_revised.json'


async def check():
    result = {'scope': 'Basic Kit/USD/RTX startup with a synthetic cube; not AI inference',
              'kit_executable': os.environ.get('EDUCATION_KIT_CHECK_EXE'),
              'scene_initialized': False, 'render_capture_written': False,
              'model_loaded': False, 'api_connected': False}
    app = omni.kit.app.get_app()
    try:
        print('Chapter 1: creating check stage', flush=True)
        await omni.usd.get_context().new_stage_async()
        print('Chapter 1: check stage opened', flush=True)
        stage = omni.usd.get_context().get_stage()
        UsdGeom.SetStageMetersPerUnit(stage, 1.0)
        UsdGeom.SetStageUpAxis(stage, UsdGeom.Tokens.z)
        cube = UsdGeom.Cube.Define(stage, '/World/CheckCube')
        cube.CreateSizeAttr(2.0)
        cube.CreateDisplayColorAttr([Gf.Vec3f(0.05, 0.65, 0.95)])
        material = UsdShade.Material.Define(stage, '/World/CheckMaterial')
        shader = UsdShade.Shader.Define(stage, '/World/CheckMaterial/Preview')
        shader.CreateIdAttr('UsdPreviewSurface')
        shader.CreateInput('diffuseColor', Sdf.ValueTypeNames.Color3f).Set(Gf.Vec3f(0))
        shader.CreateInput('emissiveColor', Sdf.ValueTypeNames.Color3f).Set(Gf.Vec3f(0.05, 0.65, 0.95))
        shader.CreateOutput('surface', Sdf.ValueTypeNames.Token)
        material.CreateSurfaceOutput().ConnectToSource(shader.ConnectableAPI(), 'surface')
        UsdShade.MaterialBindingAPI.Apply(cube.GetPrim()).Bind(material)
        camera = UsdGeom.Camera.Define(stage, '/World/CheckCamera')
        camera.CreateClippingRangeAttr(Gf.Vec2f(0.01, 100))
        view = Gf.Matrix4d().SetLookAt(Gf.Vec3d(5, -7, 5), Gf.Vec3d(0), Gf.Vec3d(0, 0, 1))
        camera.AddTransformOp().Set(view.GetInverse())
        global status_window
        status_window = ui.Window('Chapter 1 Check', width=340, height=130)
        with status_window.frame:
            with ui.VStack(spacing=8):
                ui.Label('KIT BASIC ENVIRONMENT CHECK')
                ui.Label('Synthetic cube | no AI model or API')
                ui.Label('Confirm the blue cube in the viewport.')
        for _ in range(20):
            await app.next_update_async()
        viewport = get_active_viewport()
        if viewport is None:
            raise RuntimeError('Viewport not available')
        viewport_window = get_active_viewport_window()
        viewport_window.visible = True
        viewport_window.width, viewport_window.height = 800, 600
        viewport.resolution = (800, 600)
        viewport.updates_enabled = True
        status_window.dock_in(ui.Workspace.get_window(viewport_window.title), ui.DockPosition.RIGHT, 0.28)
        viewport.camera_path = '/World/CheckCamera'
        print('Chapter 1: check camera selected', flush=True)
        for _ in range(20):
            await app.next_update_async()
        capture = ROOT / 'runs/environment/kit_basic_revised/viewport.png'
        capture.parent.mkdir(parents=True, exist_ok=True)
        print('Chapter 1: capturing viewport', flush=True)
        await capture_viewport_to_file(viewport, str(capture)).wait_for_result(completion_frames=60)
        result.update({'scene_initialized': bool(stage.GetPrimAtPath('/World/CheckCube')),
                       'render_capture_written': capture.is_file() and capture.stat().st_size > 0,
                       'viewport_capture': capture.relative_to(ROOT).as_posix()})
    except Exception as error:
        result['error'] = type(error).__name__ + ': ' + str(error)
        traceback.print_exc()
    finally:
        result['checked_at_utc'] = datetime.now(timezone.utc).isoformat()
        REPORT.parent.mkdir(parents=True, exist_ok=True)
        REPORT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print('Chapter 1 basic Kit report:', REPORT, flush=True)
        if '--verify' in sys.argv:
            app.post_quit(0 if result['scene_initialized'] and result['render_capture_written'] else 1)


TASK = asyncio.ensure_future(check())
