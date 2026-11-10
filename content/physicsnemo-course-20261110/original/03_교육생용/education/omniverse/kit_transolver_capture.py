"""Capture the current Kit render, UI, USD and condition record together."""
import hashlib
import json
from pathlib import Path
import omni.kit.app
import omni.usd
from omni.kit.viewport.utility import get_active_viewport, capture_viewport_to_file


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


async def capture_result(viewer, folder, name, expected_ticket=None):
    folder = Path(folder)
    folder.mkdir(parents=True, exist_ok=True)
    ticket = viewer.ticket if expected_ticket is None else expected_ticket
    def unchanged():
        if viewer.ticket != ticket:
            raise RuntimeError('Inputs changed while capturing; save the new result again')
    # Allow an unavailable material's first RTX compilation and temporal
    # accumulation to settle before recording the gray-state lesson figure.
    for _ in range(300 if not viewer.live else 40):
        await omni.kit.app.get_app().next_update_async()
    unchanged()
    stage = omni.usd.get_context().get_stage()
    usd = folder/(name+'.usda')
    stage.Export(str(usd))
    viewport = folder/(name+'_viewport.png')
    await capture_viewport_to_file(get_active_viewport(),str(viewport)).wait_for_result()
    unchanged()
    from omni.kit.renderer_capture import acquire_renderer_capture_interface
    screen = folder/(name+'_screen.png')
    acquire_renderer_capture_interface().capture_next_frame_swapchain(str(screen))
    for _ in range(30):
        await omni.kit.app.get_app().next_update_async()
    unchanged()
    if not viewport.is_file() or not screen.is_file():
        raise RuntimeError('Kit image capture did not complete')
    p = viewer.prediction
    record = dict(name=name,live=viewer.live,status=viewer.status_label.text,
                  input=dict(thickness_mm=viewer.thickness_mm,force_N=viewer.force_N),
                  display=viewer.display if viewer.live else None,
                  kpi=viewer.kpi_label.text,model_id=viewer.expected_model_id,
                  prediction={k:p[k] for k in ['thickness_mm','force_N','model_id','surface_version',
                    'full_max_stress_mpa','full_peak_node_id','full_peak_position_mm',
                    'full_max_displacement_mm','full_displacement_peak_node_id','full_displacement_peak_position_mm',
                    'inside_training_hull','matching_fea','full_node_count']} if viewer.live else None,
                  paths=dict(viewport=str(viewport),screen=str(screen),usd=str(usd)),
                  sha256=dict(viewport=digest(viewport),screen=digest(screen),usd=digest(usd)),
                  actual_kit_execution=True,displacement_applied_to_geometry=False)
    (folder/(name+'.json')).write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    return record
