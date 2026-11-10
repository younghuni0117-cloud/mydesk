"""Render actual HTTP inference surfaces and an enlarged thickness section."""
from pathlib import Path
import numpy as np
import pyvista as pv


def plot_thickness_predictions(surfaces, predictions, output_path):
    if len(surfaces) != 2 or len(predictions) != 2:
        raise ValueError('Provide the original and changed inference responses')
    meshes, sections = [], []
    thicknesses = []
    for surface, prediction in zip(surfaces, predictions, strict=True):
        if surface['node_ids'] != prediction['node_ids'] or surface['surface_version'] != prediction['surface_version']:
            raise ValueError('Prediction and geometry must describe the same nodes')
        points = np.asarray(surface['points_mm'], dtype=np.float64)
        thickness = float(prediction['thickness_mm'])
        np.testing.assert_allclose([points[:,2].min(),points[:,2].max()], [0,thickness], atol=1e-6,rtol=0)
        faces = np.c_[np.full(len(surface['triangles']),3),surface['triangles']].ravel()
        mesh = pv.PolyData(points, faces)
        mesh['stress_mpa'] = np.asarray(prediction['stress_mpa'], dtype=np.float64)
        section = mesh.slice(normal='y',origin=(0,80,0)).strip()
        if section.n_lines != 1:
            raise ValueError('Expected one closed hook-stem section at Y=80 mm')
        indices = section.lines[1:]
        if indices[-1] == indices[0]:indices = indices[:-1]
        polygon = pv.PolyData(section.points, np.r_[len(indices),indices]).triangulate()
        meshes.append(mesh); sections.append(polygon); thicknesses.append(thickness)
    upper = max(max(float(mesh['stress_mpa'].max()) for mesh in meshes),1e-6)
    lower = min(0., min(float(mesh['stress_mpa'].min()) for mesh in meshes))
    background = '#282828'
    font = 'C:/Windows/Fonts/malgun.ttf'
    plotter = pv.Plotter(off_screen=True, shape=(2,2), window_size=(1700,1400), border=False)
    try:
        for col,(mesh,section,thickness,prediction) in enumerate(zip(meshes,sections,thicknesses,predictions,strict=True)):
            plotter.subplot(0,col)
            plotter.set_background(background)
            # Unique scalar bar actor per panel with the exact same data range.
            key = f'prediction_{col}'
            mesh[key] = mesh['stress_mpa']
            plotter.add_mesh(mesh,scalars=key,cmap='viridis',clim=(lower,upper),lighting=False,
                show_edges=False,scalar_bar_args=dict(title=key,color='#dedede',fmt='%.1f',
                    n_labels=5,width=.72,height=.075,position_x=.14,position_y=.025,
                    title_font_size=16,label_font_size=15))
            plotter.scalar_bars[key].SetTitle('MPa')
            title = '얇은 조건' if col == 0 else '두꺼운 조건'
            plotter.add_text(f'{title}: 두께 {thickness:g} mm / 하중 {prediction["force_N"]:g} N',
                font_file=font,font_size=18,color='#dedede',position=(22,640))
            plotter.add_lines(np.array([[0,80,thickness],[15,80,thickness]]),color='white',width=4)
            plotter.add_text('실제 표면의 AI 응력 / 흰 선: 아래 단면 위치',font_file=font,
                font_size=13,color='#b9c3cb',position=(18,85))
            plotter.camera_position=[(170,-210,165),(0,17,5),(0,0,1)]
            plotter.enable_parallel_projection()
            plotter.camera.parallel_scale=98
            plotter.subplot(1,col)
            plotter.set_background(background)
            plotter.add_mesh(section,color='#83bddd' if col==0 else '#e4a270',lighting=False,show_edges=False)
            # Both section panels use the same frame and camera: the thickness
            # change is visible without an independent auto-fit of each panel.
            plotter.add_lines(np.array([[-1,80,0],[20,80,0]]),color='#8b969c',width=2)
            x=17.
            dimension = np.array([[x,80,0],[x,80,thickness],
                                  [x-.5,80,0],[x+.5,80,0],
                                  [x-.5,80,thickness],[x+.5,80,thickness]])
            plotter.add_lines(dimension,color='#dedede',width=3)
            plotter.add_point_labels([[x+1,80,thickness/2]], [f'{thickness:g} mm'],
                font_file=font,font_size=21,text_color='#dedede',show_points=False,
                shape_opacity=0,always_visible=True)
            plotter.add_text('두께 확대: Y=80 mm에서 자른 실제 X/Z 단면',
                font_file=font,font_size=17,color='#dedede',position=(22,640))
            plotter.add_text('아래 면 Z=0 고정 / 좌우 같은 축척',font_file=font,
                font_size=15,color='#b9c3cb',position='lower_left')
            plotter.camera_position=[(10,-200,6),(10,80,6),(0,0,1)]
            plotter.enable_parallel_projection()
            plotter.camera.parallel_scale=9.6
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True,exist_ok=True)
        plotter.screenshot(str(output_path))
    finally:
        plotter.close()
    return dict(image=str(output_path),thickness_mm=thicknesses,
                force_N=[float(p['force_N']) for p in predictions],
                stress_range_mpa=[lower,upper],section_y_mm=80.,
                equal_camera_scale=True,predicted_displacement_applied=False,
                source='Actual HTTP response points, triangles and nodal stress')
