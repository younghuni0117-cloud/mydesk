"""Train a fresh native PhysicsNeMo hook Transolver from chapter 3 data."""
from pathlib import Path
from dataclasses import replace
import argparse
import sys
EDUCATION = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(EDUCATION))
from course_utils.training import TrainingConfig
from course_utils.training_transolver import train_model

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', type=Path, required=True)
    parser.add_argument('--max-epochs', type=int, default=100)
    parser.add_argument('--device', choices=['cpu', 'cuda'], default='cuda')
    parser.add_argument('--controls', action='store_true')
    args = parser.parse_args()
    train_model(EDUCATION, args.output_dir,
                replace(TrainingConfig(), max_epochs=args.max_epochs), args.device,
                controls=args.controls)

if __name__ == '__main__':
    main()
