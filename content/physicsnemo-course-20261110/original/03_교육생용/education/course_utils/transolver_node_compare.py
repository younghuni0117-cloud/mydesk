"""Validation-only checks, figures and extrema for the matched node-count lesson."""
from pathlib import Path
import json
import numpy as np
import torch
from .inference import load_selected_model
from .checkpoint import load_checkpoint


def check_node_comparison(sampled_run, full_run):
    runs=[Path(sampled_run),Path(full_run)]
    configs=[json.loads((p/'training_config.json').read_text(encoding='utf-8')) for p in runs]
    summaries=[json.loads((p/'training_summary.json').read_text(encoding='utf-8')) for p in runs]
    assert configs[0]==configs[1] and configs[0]['batch_size']==1
    assert configs[0]['max_epochs']==1000
    initial=[load_checkpoint(p/'initial_model.pt','cpu') for p in runs]
    states=[x[0].state_dict() for x in initial]
    assert states[0].keys()==states[1].keys()
    assert all(torch.equal(states[0][k],states[1][k]) for k in states[0])
    assert initial[0][2]['config']==initial[1][2]['config']
    assert initial[0][2]['split']==initial[1][2]['split'] and initial[0][1].stats==initial[1][1].stats
    assert [s['sampling_mode'] for s in summaries]==['sampled','full']
    assert summaries[0]['validation_sample_sha256']==summaries[1]['validation_sample_sha256']
    assert all(s['optimizer_steps']==6000 and s['epochs_completed']==1000 for s in summaries)
    histories=[json.loads((p/'history.json').read_text(encoding='utf-8')) for p in runs]
    assert all(len(h)==1001 for h in histories)
    for i,h in enumerate(histories):
        assert [r['epoch'] for r in h]==list(range(1001))
        assert min(h[1:],key=lambda r:r['validation']['total'])['epoch']==summaries[i]['best_epoch']
    for a,b in zip(histories[0][1:],histories[1][1:]):
        assert a['train_cases']==b['train_cases']
        assert a['validation_cases']==b['validation_cases']
        assert a['optimizer_steps']==b['optimizer_steps']
    for i in range(2):
        assert not summaries[i]['test_scored']
        assert not set(initial[i][2]['split']['test']) & set(summaries[i]['train_cases']+summaries[i]['validation_cases'])
    assert abs(histories[0][0]['validation']['total']-histories[1][0]['validation']['total'])<1e-6
    return dict(same_initial_weights=True,same_training_config_and_case_order=True,
        same_split_statistics_and_fixed_validation=True,same_optimizer_steps=6000,
        both_epochs_completed=1000,training_nodes_only_changed=True,test_scored=False)


def load_node_models(education_dir, sampled_run, full_run, device='cuda'):
    loaded=[load_selected_model(education_dir,p,device) for p in [sampled_run,full_run]]
    assert loaded[0][1].stats==loaded[1][1].stats
    assert loaded[0][3]==loaded[1][3]
    return [x[0] for x in loaded],loaded[0][1]


def field_values(case,outputs,field):
    if field=='stress':
        return [case.stress[:,0],*[x['stress'][:,0] for x in outputs]],'MPa'
    if field=='displacement':
        return [np.linalg.norm(case.displacement,axis=1),
                *[np.linalg.norm(x['displacement'],axis=1) for x in outputs]],'mm'
    raise ValueError('Use stress or displacement.')


def extrema_records(case,outputs,field):
    values,unit=field_values(case,outputs,field)
    target_index=int(values[0].argmax())
    labels=['ANSYS 정답','4,096개 노드 학습','전체 노드 학습']
    records=[]
    for label,value in zip(labels,values):
        i=int(value.argmax())
        records.append(dict(label=label,maximum=float(value[i]),unit=unit,node_id=int(case.node_ids[i]),
            coordinates_mm=case.coords[i].tolist(),
            maximum_absolute_difference=float(abs(value[i]-values[0][target_index])),
            position_distance_mm=float(np.linalg.norm(case.coords[i]-case.coords[target_index]))))
    return records


def print_node_extrema(case,outputs,field):
    name='최대응력' if field=='stress' else '최대 변위 크기'
    records=extrema_records(case,outputs,field)
    for r in records:
        x,y,z=r['coordinates_mm']
        print(f"{r['label']}: {name} {r['maximum']:.6f} {r['unit']} | 노드 ID {r['node_id']}")
        print(f'  좌표(mm): X={x:.6f}, Y={y:.6f}, Z={z:.6f}')
        print(f"  정답 대비 최대값 절대차 {r['maximum_absolute_difference']:.6f} {r['unit']} | 최대 위치 거리 {r['position_distance_mm']:.6f} mm")
    return records


def plot_node_comparison(case,outputs,education_dir,output_path,epochs,field):
    import pyvista as pv
    grid=pv.read(Path(education_dir)/'data/vtu'/f'{case.case_id}.vtu')
    assert np.array_equal(grid.points,case.coords)
    values,unit=field_values(case,outputs,field)
    limits=(min(0.,*(float(v.min()) for v in values)),max(float(v.max()) for v in values))
    labels=['ANSYS 정답',f'4,096개 학습 / 선택 {epochs[0]}',f'전체 노드 학습 / 선택 {epochs[1]}']
    p=pv.Plotter(shape=(1,3),off_screen=True,window_size=(1560,680))
    for col,(value,label) in enumerate(zip(values,labels)):
        mesh=grid.copy();key=f'node_comparison_{col}';mesh.point_data[key]=value
        p.subplot(0,col);p.set_background('white')
        p.add_mesh(mesh.extract_surface(algorithm='dataset_surface'),scalars=key,cmap='turbo',
            clim=limits,show_edges=False,lighting=False,
            scalar_bar_args={'title':f'{col+1} ({unit})','color':'black'})
        p.add_text(label,font_file='C:/Windows/Fonts/malgun.ttf',font_size=14,color='black');p.view_xy()
    p.link_views();output_path=Path(output_path);output_path.parent.mkdir(parents=True,exist_ok=True)
    p.screenshot(str(output_path));p.close()
    return dict(image=str(output_path),case_id=case.case_id,field=field,color_limits=list(limits),
        same_limits_all_three_columns=True,full_case_context=True)
