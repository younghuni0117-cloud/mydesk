"""Supervised hook training; model selection uses fixed validation nodes only."""
from dataclasses import asdict, replace
from datetime import datetime, timezone
from pathlib import Path
import json
import time
import torch
from .dataset import load_prepared, file_sha256, json_write
from .checkpoint import save_checkpoint, load_checkpoint
from .hook_transolver import make_model, MODEL_CONFIG, MODEL_KIND
from .models import normalized_loss
from .training import TrainingConfig, seed_training, training_loaders, sample_fingerprint, EarlyStopping

def run_epoch(model, loader, device, normalizer, optimizer=None, gradient_clip=1.0):
    """The actual lesson loop: equal case weights, optional gradient updates."""
    training = optimizer is not None
    model.train(training)
    sums = dict(total=0.0, stress=0.0, displacement=0.0)
    physical = torch.zeros(4, device=device)
    seen = []
    with torch.set_grad_enabled(training):
        for batch in loader:
            tensors = {k: batch[k].to(device) for k in ['coords', 'globals', 'stress', 'displacement']}
            if training:
                optimizer.zero_grad(set_to_none=True)
            output = model((tensors['coords'], tensors['globals']))
            losses = normalized_loss(output, tensors)
            if not all(torch.isfinite(v).item() for v in losses.values()):
                raise FloatingPointError('Non-finite loss; check data and settings.')
            if training:
                losses['total'].backward()
                torch.nn.utils.clip_grad_norm_(model.parameters(), gradient_clip, error_if_nonfinite=True)
                optimizer.step()
            count = len(batch['case_id'])
            seen.extend(batch['case_id'])
            for k in sums:
                sums[k] += losses[k].detach().item() * count
            with torch.no_grad():
                errors = [
                    (normalizer.denormalize(k, output[k].detach()) -
                     normalizer.denormalize(k, tensors[k])).abs().mean(dim=(0, 1))
                    for k in ['stress', 'displacement']]
                physical += torch.cat(errors) * count
    if not seen or len(set(seen)) != len(seen):
        raise ValueError('Empty loader or repeated cases.')
    values = (physical / len(seen)).cpu().tolist()
    return {'loss': {k: v / len(seen) for k, v in sums.items()}, 'cases': seen,
            'mae': dict(stress_MPa=values[0], displacement_X_mm=values[1],
                        displacement_Y_mm=values[2], displacement_Z_mm=values[3])}

def train_model(education_dir, output_dir, config=None, device='cuda', model_config=None,
                controls=False):
    config = config or replace(TrainingConfig(), max_epochs=100, log_every=10)
    config.validate()
    education_dir, output_dir = Path(education_dir).resolve(), Path(output_dir).resolve()
    if output_dir.exists() and any(output_dir.iterdir()):
        raise FileExistsError(f'Use a new run folder: {output_dir}')
    if str(device) == 'cuda' and not torch.cuda.is_available():
        raise RuntimeError('Complete chapter 1 CUDA/GPU checks before training.')
    seed_training(config.seed)
    device = torch.device(device)
    cases, split, normalizer, fixed, data_manifest = load_prepared(
        education_dir / 'data', education_dir / 'runs/dataset')
    datasets, loaders = training_loaders(cases, split, normalizer, fixed, config)
    model_config = dict(MODEL_CONFIG if model_config is None else model_config)
    model = make_model(model_config).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=config.learning_rate,
                                 weight_decay=config.weight_decay)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode='min',
        factor=config.scheduler_factor, patience=config.scheduler_patience,
        min_lr=config.min_learning_rate)
    stopper = EarlyStopping(config.early_stopping_patience, config.early_stopping_min_delta)
    output_dir.mkdir(parents=True, exist_ok=True)
    sources = ['course_utils/hook_transolver.py', 'course_utils/training_transolver.py',
               'course_utils/checkpoint.py', 'course_utils/models.py', 'course_utils/dataset.py',
               'course_utils/training.py']
    provenance = {'created_at_utc': datetime.now(timezone.utc).isoformat(),
        'model_kind': MODEL_KIND, 'dataset_manifest_sha256': file_sha256(
            education_dir / 'runs/dataset/dataset_manifest.json'),
        'vtu_sha256': data_manifest['vtu_sha256'],
        'source_code_sha256': {p: file_sha256(education_dir / p) for p in sources},
        'training_config': asdict(config), 'model_config': model_config,
        'torch': str(torch.__version__), 'device': str(device),
        'gpu': torch.cuda.get_device_name(device) if device.type == 'cuda' else None,
        'controls_enabled': controls, 'precision': 'float32; AMP and TF32 disabled',
        'sampling': '4096 unique nodes per case; train changes each epoch; validation fixed',
        'inference_policy': 'Whole case together; no independent point chunks',
        'input_order': ['thickness_mm', 'force_N'],
        'output_order': ['von_mises_stress', 'displacement_X', 'displacement_Y', 'displacement_Z']}
    json_write(output_dir / 'training_config.json', asdict(config))
    json_write(output_dir / 'run_status.json', {'status': 'running'})
    save_checkpoint(output_dir / 'initial_model.pt', model, model_config, split,
                    normalizer.stats, provenance)
    start = time.perf_counter()
    history = []
    best_value, best_epoch = float('inf'), None
    validation_samples = sample_fingerprint(datasets['validation'])
    stop_reason = 'max_epochs'
    try:
        baseline = run_epoch(model, loaders['validation'], device, normalizer)
        history.append({'epoch': 0, 'train': None, 'validation': baseline['loss'],
                        'validation_mae': baseline['mae'], 'learning_rate': config.learning_rate,
                        'elapsed_seconds': time.perf_counter() - start})
        print(f"초기 검증 손실: {baseline['loss']['total']:.6f}", flush=True)
        for epoch in range(1, config.max_epochs + 1):
            datasets['train'].set_epoch(epoch - 1)
            lr = optimizer.param_groups[0]['lr']
            train = run_epoch(model, loaders['train'], device, normalizer, optimizer, config.gradient_clip)
            val = run_epoch(model, loaders['validation'], device, normalizer)
            assert set(train['cases']) == set(split['train'])
            assert set(val['cases']) == set(split['validation'])
            assert sample_fingerprint(datasets['validation']) == validation_samples
            value = val['loss']['total']
            improved = value < best_value
            if improved:
                best_value, best_epoch = value, epoch
            if controls:
                scheduler.step(value)
            should_stop = stopper.update(value) if controls else False
            history.append({'epoch': epoch, 'train': train['loss'], 'validation': val['loss'],
                'validation_mae': val['mae'], 'learning_rate': lr,
                'next_learning_rate': optimizer.param_groups[0]['lr'],
                'saved_as_best': improved, 'train_cases': train['cases'],
                'validation_cases': val['cases'], 'train_sampling_epoch': epoch - 1,
                'train_sample_sha256': sample_fingerprint(datasets['train']),
                'elapsed_seconds': time.perf_counter() - start})
            state = {'status': 'trained', 'epoch': epoch, 'validation_loss': val['loss'],
                'validation_mae': val['mae'], 'best_epoch': best_epoch,
                'selection_rule': 'Lowest validation total loss among completed epochs 1..E',
                'resume_supported': False}
            save_checkpoint(output_dir / 'latest_model.pt', model, model_config, split,
                            normalizer.stats, provenance, state)
            if improved:
                save_checkpoint(output_dir / 'best_model.pt', model, model_config, split,
                                normalizer.stats, provenance, state)
            json_write(output_dir / 'history.json', history)
            if epoch == 1 or epoch % config.log_every == 0 or should_stop:
                print(f"에폭 {epoch:03d} | 학습 손실 {train['loss']['total']:.6f} | "
                      f"검증 손실 {value:.6f} | 응력 MAE {val['mae']['stress_MPa']:.3f} MPa | 선택 에폭 {best_epoch}", flush=True)
            if should_stop:
                stop_reason = 'early_stopping'
                break
        restored, saved_norm, package = load_checkpoint(output_dir / 'best_model.pt', device,
                                                        split['split_sha256'])
        assert saved_norm.stats == normalizer.stats
        reloaded = run_epoch(restored, loaders['validation'], device, saved_norm)
        reload_error = max(abs(reloaded['loss'][k] - package['training']['validation_loss'][k])
                           for k in reloaded['loss'])
        if reload_error > 1e-6:
            raise AssertionError('Reloaded validation loss differs from selected checkpoint.')
        summary = {'status': 'completed', 'model_kind': MODEL_KIND, 'device': str(device),
            'epochs_completed': epoch, 'best_epoch': best_epoch, 'stop_reason': stop_reason,
            'initial_validation_loss': baseline['loss'], 'best_validation_loss': reloaded['loss'],
            'latest_validation_loss': history[-1]['validation'],
            'initial_validation_mae': baseline['mae'], 'best_validation_mae': reloaded['mae'],
            'elapsed_seconds': time.perf_counter() - start,
            'train_cases': split['train'], 'validation_cases': split['validation'],
            'test_scored': False, 'points_per_case': 4096,
            'validation_sample_sha256': validation_samples,
            'split_sha256': split['split_sha256'], 'stats_sha256': normalizer.stats['stats_sha256'],
            'best_reload_validation_max_difference': reload_error,
            'checkpoint_policy': 'best: validation minimum; latest: final epoch; optimizer resume unsupported',
            'loss_scope': 'Z-score MSE: stress + mean of XYZ displacement; fixed sampled validation'}
        json_write(output_dir / 'training_summary.json', summary)
        names = ['initial_model.pt', 'best_model.pt', 'latest_model.pt', 'history.json',
                 'training_config.json', 'training_summary.json']
        json_write(output_dir / 'training_manifest.json', {'schema_version': 1,
            'status': 'completed', 'test_scored': False, 'provenance': provenance,
            'split_sha256': split['split_sha256'], 'stats_sha256': normalizer.stats['stats_sha256'],
            'artifact_sha256': {p: file_sha256(output_dir / p) for p in names}})
        json_write(output_dir / 'run_status.json', {'status': 'completed'})
        print(f'완료: {epoch}에폭, 선택 에폭 {best_epoch}, 시험 자료 평가 없음', flush=True)
        return summary
    except Exception as error:
        json_write(output_dir / 'run_status.json', {'status': 'failed', 'error': str(error)})
        raise
