"""Compare epoch budgets using validation data and identical initial conditions."""
from pathlib import Path
import json
import numpy as np
import torch
from .checkpoint import load_checkpoint
from .inference import predict_fields

def check_comparison(run_100, run_1000):
    run_100, run_1000 = Path(run_100), Path(run_1000)
    configs = [json.loads((p/'training_config.json').read_text(encoding='utf-8'))
               for p in [run_100, run_1000]]
    assert configs[0]['max_epochs'] == 100 and configs[1]['max_epochs'] == 1000
    # Print frequency affects display only; learning settings must still match.
    assert {k:v for k,v in configs[0].items() if k not in {'max_epochs','log_every'}} == {
        k:v for k,v in configs[1].items() if k not in {'max_epochs','log_every'}}
    models = [load_checkpoint(p/'initial_model.pt','cpu') for p in [run_100,run_1000]]
    left,right = [m.state_dict() for m,_,_ in models]
    assert left.keys()==right.keys() and all(torch.equal(left[k],right[k]) for k in left)
    assert models[0][2]['config']==models[1][2]['config']
    assert models[0][2]['split']==models[1][2]['split'] and models[0][1].stats==models[1][1].stats
    traces=[json.loads((p/'history.json').read_text(encoding='utf-8')) for p in [run_100,run_1000]]
    assert len(traces[0])==101 and len(traces[1])==1001, 'Both epoch budgets must finish.'
    prefix_error=max(abs(a['validation']['total']-b['validation']['total'])
                     for a,b in zip(traces[0],traces[1][:101]))
    same_sampling=all(a.get('train_sample_sha256')==b.get('train_sample_sha256')
                      for a,b in zip(traces[0],traces[1][:101]))
    assert same_sampling
    # Numeric equality is scoped to the recorded runtime; another device may differ.
    assert prefix_error < 1e-6, 'The first 100 epochs differ; check runtime and settings.'
    return {'same_initial_weights':True,'same_model_data_statistics_and_learning_settings':True,
            'same_first_100_node_selections':same_sampling,
            'first_100_validation_max_difference':prefix_error,'test_scored':False}

def compare_case(model_100, model_1000, normalizer, case):
    outputs=[predict_fields(m,normalizer,case.coords,case.globals) for m in [model_100,model_1000]]
    rows=[]
    for output in outputs:
        stress=output['stress'][:,0]; target=case.stress[:,0]
        high=target>=np.quantile(target,.95)
        rows.append({'case_id':case.case_id,'nodes':len(case.coords),
            'stress_mae_MPa':float(np.abs(stress-target).mean()),
            'stress_max_MPa':float(stress.max()),'target_stress_max_MPa':float(target.max()),
            'stress_top5pct_mae_MPa':float(np.abs(stress[high]-target[high]).mean()),
            'displacement_XYZ_mae_mm':np.abs(output['displacement']-case.displacement).mean(0).tolist(),
            'displacement_magnitude_mae_mm':float(np.abs(np.linalg.norm(output['displacement'],axis=-1)
                -np.linalg.norm(case.displacement,axis=-1)).mean()),
            'minimum_stress_prediction_MPa':float(stress.min()),
            'max_stress_position_error_mm':float(np.linalg.norm(case.coords[stress.argmax()]-case.coords[target.argmax()]))})
    return outputs,rows

def plot_comparison(case, outputs, education_dir, output_path, selected_epochs, field='stress'):
    import pyvista as pv
    grid=pv.read(Path(education_dir)/'data/vtu'/f'{case.case_id}.vtu')
    assert len(grid.points)==len(case.coords) and np.array_equal(grid.points,case.coords)
    if field=='stress':
        values=[case.stress[:,0],*[p['stress'][:,0] for p in outputs]];unit='MPa'
    elif field=='displacement':
        values=[np.linalg.norm(case.displacement,axis=-1),*[np.linalg.norm(p['displacement'],axis=-1) for p in outputs]];unit='mm'
    else:
        raise ValueError('Expected stress or displacement.')
    limits=(min(0.,*(float(v.min()) for v in values)),max(float(v.max()) for v in values))
    plotter=pv.Plotter(shape=(1,3),off_screen=True,window_size=(1560,680))
    titles=['ANSYS 정답',f'100에폭 실행 / 선택 {selected_epochs[0]}',f'1,000에폭 실행 / 선택 {selected_epochs[1]}']
    for col,(value,title) in enumerate(zip(values,titles)):
        mesh=grid.copy();key=f'comparison_{col}';mesh.point_data[key]=value
        plotter.subplot(0,col);plotter.set_background('white')
        plotter.add_mesh(mesh.extract_surface(algorithm='dataset_surface'),scalars=key,cmap='turbo',
            clim=limits,show_edges=False,lighting=False,
            scalar_bar_args={'title':f'{col+1} ({unit})','color':'black'})
        plotter.add_text(title,font_file='C:/Windows/Fonts/malgun.ttf',font_size=14,color='black')
        plotter.view_xy()
    plotter.link_views();output_path=Path(output_path);output_path.parent.mkdir(parents=True,exist_ok=True)
    plotter.screenshot(str(output_path));plotter.close()
    return {'image':str(output_path),'field':field,'case_id':case.case_id,
            'color_limits':list(limits),'same_limits_all_three_columns':True,
            'full_case_context':True}
