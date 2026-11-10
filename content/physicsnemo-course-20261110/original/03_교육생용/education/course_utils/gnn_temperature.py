"""Graph preparation for the chapter 4 steady-temperature teaching example.

Only coordinates, boundary flags and connectivity are constructed here.
Temperature labels are never used as node inputs or to construct edges.
"""
import torch
from torch_geometric.data import Data


def make_plate_graph(batch_size=1, device='cpu', strides=(1, 4, 16)):
    """Independent 32 x 32 graphs; stride > 1 denotes a computational edge."""
    if not isinstance(batch_size, int) or batch_size < 1:
        raise ValueError('batch_size must be a positive integer')
    if not strides or any(not isinstance(s, int) or not 1 <= s < 32 for s in strides):
        raise ValueError('strides must contain integers between 1 and 31')
    y, x = torch.meshgrid(torch.linspace(0, 1, 32),
                          torch.linspace(0, 1, 32), indexing='ij')
    positions = torch.stack([x.flatten(), y.flatten()], dim=1)
    boundary = ((positions == 0) | (positions == 1)).any(dim=1, keepdim=True).float()
    node_ids = torch.arange(1024).reshape(32, 32)
    links = []
    for stride in strides:
        horizontal = (node_ids[:, :-stride].flatten(), node_ids[:, stride:].flatten())
        vertical = (node_ids[:-stride, :].flatten(), node_ids[stride:, :].flatten())
        for start, end in (horizontal, vertical):
            links.extend([torch.stack([start, end]), torch.stack([end, start])])
    edge_index = torch.cat(links, dim=1)
    relative = positions[edge_index[1]] - positions[edge_index[0]]
    edge_features = torch.cat([relative, relative.norm(dim=1, keepdim=True)], dim=1)
    # An offset of 1,024 per case prevents links between different cases.
    offsets = torch.arange(batch_size)[:, None, None] * 1024
    batched_edges = (edge_index[None] + offsets).permute(1, 0, 2).reshape(2, -1)
    return Data(edge_index=batched_edges, num_nodes=batch_size * 1024,
                pos=positions.repeat(batch_size, 1),
                boundary=boundary.repeat(batch_size, 1),
                edge_attr=edge_features.repeat(batch_size, 1),
                batch=torch.arange(batch_size).repeat_interleave(1024)).to(device)


def predict_temperature(model, source, graph):
    """Normalized heat source -> normalized temperature; preserve row-major order."""
    if source.ndim != 4 or tuple(source.shape[1:]) != (1, 32, 32):
        raise ValueError('source must have shape (batch, 1, 32, 32)')
    if graph.num_nodes != len(source) * 1024:
        raise ValueError('graph and source must have the same number of cases')
    node_inputs = torch.cat([source.reshape(-1, 1), graph.pos, graph.boundary], dim=1)
    output = model(node_inputs, graph.edge_attr, graph)
    return output.reshape(len(source), 1, 32, 32)
