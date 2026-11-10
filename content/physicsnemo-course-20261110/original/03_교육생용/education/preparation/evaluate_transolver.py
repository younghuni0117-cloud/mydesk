"""Evaluate an explicitly selected chapter 5 Transolver run, or audit its saved outputs."""
from pathlib import Path
import argparse
import json
import sys
EDUCATION = Path(__file__).resolve().parents[1]
sys.path.insert(0,str(EDUCATION))
from course_utils.inference import load_selected_model, predict_fields
from course_utils.training import seed_training
from course_utils.transolver_evaluation import save_evaluation, plot_case, audit_evaluation

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--training-dir',type=Path)
    parser.add_argument('--output-dir',type=Path,required=True)
    parser.add_argument('--device',choices=['cuda','cpu'],default='cuda')
    parser.add_argument('--audit',action='store_true')
    args=parser.parse_args()
    if args.audit:
        result=audit_evaluation(EDUCATION,args.output_dir,args.device)
        print(json.dumps(dict(passed=result['passed'],selected_epoch=result['selected_epoch'],
                             cases=list(result['cases'])),ensure_ascii=False))
        return
    if args.training_dir is None:
        parser.error('--training-dir is required for evaluation')
    if args.output_dir.exists() and any(args.output_dir.iterdir()):
        raise FileExistsError('Choose a new empty output directory')
    seed_training(42)
    model,norm,cases,split,fixed,context=load_selected_model(EDUCATION,args.training_dir,args.device)
    assert getattr(model,'requires_full_point_context',False)
    args.output_dir.mkdir(parents=True,exist_ok=True)
    predictions={}
    for cid in split['test']:
        predictions[cid]=predict_fields(model,norm,cases[cid].coords,cases[cid].globals)
        plot_case(EDUCATION,cases[cid],predictions[cid],args.output_dir/f'{cid}_comparison.png')
    save_evaluation(EDUCATION,args.output_dir,args.training_dir,context,cases,split,fixed,predictions,args.device)
    print('Evaluation saved:',args.output_dir)

if __name__=='__main__':
    main()
