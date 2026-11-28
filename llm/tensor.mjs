// Row-major matrices with reverse-mode derivatives for the decoder's operations.
export class Matrix {
  constructor(rows, cols, values) {
    this.rows = rows;
    this.cols = cols;
    this.values = values ?? new Float32Array(rows * cols);
    this.grad = new Float32Array(rows * cols);
  }
}

export class Tape {
  constructor(record = false) {
    this.reverse = [];
    this.record = record;
  }

  operation(rows, cols, forward, backward) {
    const result = new Matrix(rows, cols);
    forward(result.values);
    if (this.record) this.reverse.push(() => backward(result.grad, result.values));
    return result;
  }

  backward() {
    for (let i = this.reverse.length - 1; i >= 0; i--) this.reverse[i]();
  }

  embed(ids, token, position) {
    const width = token.cols;
    return this.operation(ids.length, width, out => {
      for (let r = 0; r < ids.length; r++) for (let c = 0; c < width; c++) {
        const i = r * width + c;
        out[i] = token.values[ids[r] * width + c] + position.values[i];
      }
    }, grad => {
      for (let r = 0; r < ids.length; r++) for (let c = 0; c < width; c++) {
        const i = r * width + c;
        token.grad[ids[r] * width + c] += grad[i];
        position.grad[i] += grad[i];
      }
    });
  }

  linear(input, weight, bias) {
    const width = input.cols;
    const outputs = weight.cols;
    return this.operation(input.rows, outputs, out => {
      for (let row = 0; row < input.rows; row++) {
        const offset = row * outputs;
        if (bias) out.set(bias.values, offset);
        for (let k = 0; k < width; k++) {
          const x = input.values[row * width + k];
          for (let j = 0; j < outputs; j++) out[offset + j] += x * weight.values[k * outputs + j];
        }
      }
    }, grad => {
      for (let row = 0; row < input.rows; row++) {
        for (let j = 0; j < outputs; j++) {
          const g = grad[row * outputs + j];
          if (bias) bias.grad[j] += g;
          for (let k = 0; k < width; k++) {
            const i = row * width + k;
            const w = k * outputs + j;
            input.grad[i] += weight.values[w] * g;
            weight.grad[w] += input.values[i] * g;
          }
        }
      }
    });
  }

  add(a, b) {
    return this.operation(a.rows, a.cols, out => {
      for (let i = 0; i < out.length; i++) out[i] = a.values[i] + b.values[i];
    }, grad => {
      for (let i = 0; i < grad.length; i++) {
        a.grad[i] += grad[i];
        b.grad[i] += grad[i];
      }
    });
  }

  relu(input) {
    return this.operation(input.rows, input.cols, out => {
      for (let i = 0; i < out.length; i++) out[i] = Math.max(0, input.values[i]);
    }, grad => {
      for (let i = 0; i < grad.length; i++) if (input.values[i] > 0) input.grad[i] += grad[i];
    });
  }

  norm(input, gain, bias) {
    const width = input.cols;
    const normalized = new Float32Array(input.values.length);
    const inverseStd = new Float32Array(input.rows);
    return this.operation(input.rows, width, out => {
      for (let r = 0; r < input.rows; r++) {
        const offset = r * width;
        let mean = 0, variance = 0;
        for (let c = 0; c < width; c++) mean += input.values[offset + c] / width;
        for (let c = 0; c < width; c++) variance += (input.values[offset + c] - mean) ** 2 / width;
        inverseStd[r] = 1 / Math.sqrt(variance + 1e-5);
        for (let c = 0; c < width; c++) {
          const i = offset + c;
          normalized[i] = (input.values[i] - mean) * inverseStd[r];
          out[i] = normalized[i] * gain.values[c] + bias.values[c];
        }
      }
    }, grad => {
      for (let r = 0; r < input.rows; r++) {
        const offset = r * width;
        let mean = 0, projection = 0;
        for (let c = 0; c < width; c++) {
          const i = offset + c;
          const scaled = grad[i] * gain.values[c];
          mean += scaled / width;
          projection += scaled * normalized[i] / width;
          gain.grad[c] += grad[i] * normalized[i];
          bias.grad[c] += grad[i];
        }
        for (let c = 0; c < width; c++) {
          const i = offset + c;
          input.grad[i] += (grad[i] * gain.values[c] - mean - normalized[i] * projection) * inverseStd[r];
        }
      }
    });
  }

  attention(q, k, v, heads) {
    const length = q.rows, width = q.cols, depth = width / heads;
    const scale = 1 / Math.sqrt(depth);
    const scores = Array.from({length: heads}, () => new Float32Array(length * length));
    const output = this.operation(length, width, out => {
      for (let h = 0; h < heads; h++) for (let t = 0; t < length; t++) {
        const row = t * length;
        const query = t * width + h * depth;
        let maximum = -Infinity, total = 0;
        for (let s = 0; s <= t; s++) {
          let dot = 0;
          for (let c = 0; c < depth; c++) dot += q.values[query+c] * k.values[s*width+h*depth+c];
          scores[h][row+s] = dot * scale;
          maximum = Math.max(maximum, scores[h][row+s]);
        }
        for (let s = 0; s <= t; s++) {
          scores[h][row+s] = Math.exp(scores[h][row+s] - maximum);
          total += scores[h][row+s];
        }
        for (let s = 0; s <= t; s++) {
          const probability = scores[h][row+s] /= total;
          for (let c = 0; c < depth; c++) out[query+c] += probability * v.values[s*width+h*depth+c];
        }
      }
    }, grad => {
      const scoreGrad = new Float32Array(length);
      for (let h = 0; h < heads; h++) for (let t = 0; t < length; t++) {
        const row = t * length;
        const query = t * width + h * depth;
        let average = 0;
        for (let s = 0; s <= t; s++) {
          const source = s * width + h * depth;
          const probability = scores[h][row+s];
          let dot = 0;
          for (let c = 0; c < depth; c++) {
            dot += grad[query+c] * v.values[source+c];
            v.grad[source+c] += probability * grad[query+c];
          }
          scoreGrad[s] = dot;
          average += probability * dot;
        }
        for (let s = 0; s <= t; s++) {
          const source = s * width + h * depth;
          const derivative = scores[h][row+s] * (scoreGrad[s] - average) * scale;
          for (let c = 0; c < depth; c++) {
            q.grad[query+c] += derivative * k.values[source+c];
            k.grad[source+c] += derivative * q.values[query+c];
          }
        }
      }
    });
    return {output, scores};
  }
}

export function softmax(values, temperature = 1) {
  let maximum = -Infinity, total = 0;
  for (const value of values) maximum = Math.max(maximum, value);
  const out = Float64Array.from(values, value => {
    const exponent = Math.exp((value - maximum) / temperature);
    total += exponent;
    return exponent;
  });
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

export function crossEntropy(logits, targets, training = false) {
  let total = 0, correct = 0;
  const byToken = new Map();
  for (let row = 0; row < targets.length; row++) {
    const offset = row * logits.cols;
    const values = logits.values.subarray(offset, offset + logits.cols);
    const target = targets[row];
    let best = 0, sum = 0;
    for (let i = 1; i < values.length; i++) if (values[i] > values[best]) best = i;
    const max = values[best];
    for (const value of values) sum += Math.exp(value - max);
    const loss = Math.log(sum) + max - values[target];
    total += loss;
    correct += Number(best === target);
    const record = byToken.get(target) ?? {count:0, loss:0};
    record.count++;
    record.loss += loss;
    byToken.set(target, record);
    if (training) for (let i = 0; i < values.length; i++) {
      logits.grad[offset+i] = (Math.exp(values[i] - max) / sum - Number(i === target)) / targets.length;
    }
  }
  return {loss:total / targets.length, accuracy:correct / targets.length, byToken:[...byToken]};
}
