"""Matched single-case training: sampled nodes versus every node of each case."""
from dataclasses import asdict, replace
from datetime import datetime, timezone
from pathlib import Path
import gc
import time
import numpy as np
import torch
from torch.utils.data import Dataset, DataLoader
from .dataset import load_prepared, file_sha256, json_write
from .checkpoint import save_checkpoint, load_checkpoint
from .hook_transolver import make_model, MODEL_CONFIG, MODEL_KIND
from .training import TrainingConfig, seed_training, training_loaders, sample_fingerprint
from .training_transolver import run_epoch


class FullCaseDataset(Dataset):
    """One complete, variably sized case per item, in the original node order."""
    def __init__(self, cases, case_ids, normalizer):
        self.cases, self.case_ids, self.normalizer = cases, tuple(case_ids), normalizer
        self.epoch = 0

    def __len__(self):
        return len(self.case_ids)

    def set_epoch(self, epoch):
        self.epoch = int(epoch)

    def sample_indices(self, index):
        return np.arange(len(self.cases[self.case_ids[index]].coords), dtype=np.int64)

    def __getitem__(self, index):
        cid = self.case_ids[index]
        case = self.cases[cid]
        raw = dict(coords=case.coords, globals=case.globals,
                   stress=case.stress, displacement=case.displacement)
        item = {k: torch.from_numpy(self.normalizer.normalize(k, v).astype(np.float32))
                for k, v in raw.items()}
        item.update(case_id=cid, node_ids=torch.from_numpy(case.node_ids.copy()))
        return item


def node_loaders(cases, split, normalizer, fixed, config, mode):
    if mode not in {'sampled', 'full'} or config.batch_size != 1:
        raise ValueError('Use mode sampled/full and batch_size=1 for the matched comparison.')
    datasets, loaders = training_loaders(cases, split, normalizer, fixed, config)
    if mode == 'full':
        datasets['train'] = FullCaseDataset(cases, split['train'], normalizer)
        loaders['train'] = DataLoader(datasets['train'], batch_size=1, shuffle=True,
            num_workers=0, generator=torch.Generator().manual_seed(config.seed))
    return datasets, loaders


def train_node_model(education_dir, output_dir, mode, config=None, device='cuda'):
    """Same optimizer/loss/validation/selection for both modes; no test evaluation."""
    config = config or replace(TrainingConfig(), batch_size=1, max_epochs=1000, log_every=100)
    config.validate()
    if mode not in {'sampled', 'full'} or config.batch_size != 1:
        raise ValueError('Use sampled/full with one case per training step.')
    if torch.device(device).type != 'cuda' or not torch.cuda.is_available():
        raise RuntimeError('This comparison requires the chapter 1 CUDA environment.')
    education_dir, output_dir = Path(education_dir).resolve(), Path(output_dir).resolve()
    if output_dir.exists() and any(output_dir.iterdir()):
        raise FileExistsError(f'Use a new run folder: {output_dir}')
    seed_training(config.seed)
    device = torch.device(device)
    cases, split, normalizer, fixed, data_manifest = load_prepared(
        education_dir/'data', education_dir/'runs/dataset')
    datasets, loaders = node_loaders(cases, split, normalizer, fixed, config, mode)
    gc.collect()
    torch.cuda.empty_cache()
    torch.cuda.synchronize(device)
    baseline_bytes = torch.cuda.memory_allocated(device)
    torch.cuda.reset_peak_memory_stats(device)
    model = make_model().to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=config.learning_rate,
                                 weight_decay=config.weight_decay)
    sources = ['course_utils/training_transolver_nodes.py', 'course_utils/training_transolver.py',
        'course_utils/hook_transolver.py', 'course_utils/checkpoint.py',
        'course_utils/models.py', 'course_utils/dataset.py', 'course_utils/training.py']
    counts = {cid: len(cases[cid].coords) if mode == 'full' else 4096 for cid in split['train']}
    provenance = dict(created_at_utc=datetime.now(timezone.utc).isoformat(), model_kind=MODEL_KIND,
        dataset_manifest_sha256=file_sha256(education_dir/'runs/dataset/dataset_manifest.json'),
        vtu_sha256=data_manifest['vtu_sha256'],
        source_code_sha256={p: file_sha256(education_dir/p) for p in sources},
        training_config=asdict(config), model_config=dict(MODEL_CONFIG),
        torch=str(torch.__version__), device=str(device), gpu=torch.cuda.get_device_name(device),
        controls_enabled=False, precision='float32; AMP and TF32 disabled',
        sampling_mode=mode, train_nodes_per_case=counts,
        validation_policy='Same fixed 4096 nodes per validation case; batch_size=1',
        inference_policy='Whole case together; no independent point chunks',
        input_order=['thickness_mm','force_N'],
        output_order=['von_mises_stress','displacement_X','displacement_Y','displacement_Z'])
    output_dir.mkdir(parents=True, exist_ok=True)
    json_write(output_dir/'training_config.json', asdict(config))
    json_write(output_dir/'run_status.json', {'status':'running'})
    save_checkpoint(output_dir/'initial_model.pt', model, MODEL_CONFIG, split, normalizer.stats, provenance)
    validation_signature = sample_fingerprint(datasets['validation'])
    torch.cuda.synchronize(device)
    start = time.perf_counter()
    history = []
    best_value, best_epoch = float('inf'), None
    try:
        baseline = run_epoch(model, loaders['validation'], device, normalizer)
        history.append(dict(epoch=0, train=None, validation=baseline['loss'],
            validation_mae=baseline['mae'], learning_rate=config.learning_rate,
            elapsed_seconds=time.perf_counter()-start))
        print(f"{mode} | 초기 검증 손실 {baseline['loss']['total']:.6f}", flush=True)
        for epoch in range(1, config.max_epochs+1):
            datasets['train'].set_epoch(epoch-1)
            train = run_epoch(model, loaders['train'], device, normalizer, optimizer, config.gradient_clip)
            val = run_epoch(model, loaders['validation'], device, normalizer)
            assert set(train['cases']) == set(split['train'])
            assert set(val['cases']) == set(split['validation'])
            assert not set(split['test']) & set(train['cases']+val['cases'])
            assert sample_fingerprint(datasets['validation']) == validation_signature
            improved = val['loss']['total'] < best_value
            if improved:
                best_value, best_epoch = val['loss']['total'], epoch
            history.append(dict(epoch=epoch, train=train['loss'], validation=val['loss'],
                validation_mae=val['mae'], learning_rate=config.learning_rate,
                next_learning_rate=config.learning_rate, saved_as_best=improved,
                train_cases=train['cases'], validation_cases=val['cases'],
                train_sampling_epoch=epoch-1, train_sample_sha256=sample_fingerprint(datasets['train']),
                optimizer_steps=epoch*len(split['train']), elapsed_seconds=time.perf_counter()-start))
            state = dict(status='trained', epoch=epoch, validation_loss=val['loss'],
                validation_mae=val['mae'], best_epoch=best_epoch,
                selection_rule='Lowest validation total loss among completed epochs 1..E',
                resume_supported=False)
            save_checkpoint(output_dir/'latest_model.pt', model, MODEL_CONFIG, split, normalizer.stats, provenance, state)
            if improved:
                save_checkpoint(output_dir/'best_model.pt', model, MODEL_CONFIG, split, normalizer.stats, provenance, state)
            json_write(output_dir/'history.json', history)
            if epoch == 1 or epoch % config.log_every == 0 or epoch == config.max_epochs:
                print(f"{mode} | 에폭 {epoch:04d} | 검증 손실 {val['loss']['total']:.6f} | "
                      f"응력 MAE {val['mae']['stress_MPa']:.3f} MPa | 선택 에폭 {best_epoch}", flush=True)
        del optimizer
        restored, saved_norm, package = load_checkpoint(output_dir/'best_model.pt', device, split['split_sha256'])
        assert saved_norm.stats == normalizer.stats
        reloaded = run_epoch(restored, loaders['validation'], device, saved_norm)
        reload_error = max(abs(reloaded['loss'][k]-package['training']['validation_loss'][k]) for k in reloaded['loss'])
        assert reload_error < 1e-6
        torch.cuda.synchronize(device)
        peak_bytes = torch.cuda.max_memory_allocated(device)
        summary = dict(status='completed', model_kind=MODEL_KIND, device=str(device),
            epochs_completed=epoch, best_epoch=best_epoch, stop_reason='max_epochs',
            initial_validation_loss=baseline['loss'], best_validation_loss=reloaded['loss'],
            latest_validation_loss=history[-1]['validation'],
            initial_validation_mae=baseline['mae'], best_validation_mae=reloaded['mae'],
            elapsed_seconds=time.perf_counter()-start,
            train_cases=split['train'], validation_cases=split['validation'], test_scored=False,
            sampling_mode=mode, train_nodes_per_case=counts, batch_size=1,
            steps_per_epoch=len(split['train']), optimizer_steps=epoch*len(split['train']),
            validation_points_per_case=4096, validation_sample_sha256=validation_signature,
            split_sha256=split['split_sha256'], stats_sha256=normalizer.stats['stats_sha256'],
            best_reload_validation_max_difference=reload_error,
            peak_allocated_MiB=peak_bytes/2**20,
            incremental_peak_allocated_MiB=(peak_bytes-baseline_bytes)/2**20,
            memory_measurement='PyTorch maximum allocated bytes above pre-run baseline; not reserved/total GPU memory',
            checkpoint_policy='best: validation minimum; latest: final epoch; optimizer resume unsupported',
            loss_scope='Z-score MSE: stress + mean XYZ displacement; equal case weights; fixed sampled validation')
        json_write(output_dir/'training_summary.json', summary)
        names=['initial_model.pt','best_model.pt','latest_model.pt','history.json',
               'training_config.json','training_summary.json']
        json_write(output_dir/'training_manifest.json', dict(schema_version=1,status='completed',test_scored=False,
            provenance=provenance,split_sha256=split['split_sha256'],stats_sha256=normalizer.stats['stats_sha256'],
            artifact_sha256={p:file_sha256(output_dir/p) for p in names}))
        json_write(output_dir/'run_status.json', {'status':'completed'})
        return summary
    except Exception as error:
        json_write(output_dir/'run_status.json', {'status':'failed','error':str(error)})
        raise
