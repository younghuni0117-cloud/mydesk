"""Display live Transolver fields without changing the legacy reference viewer."""
import math
from pxr import Gf, Sdf, UsdGeom, UsdShade
from scene import create_scene, colors, update_scene as legacy_update


def mark_scene_stale(stage):
    mesh = UsdGeom.Mesh.Get(stage, '/World/Hook')
    mesh.GetPrim().SetCustomDataByKey('stale', True)
    mesh.GetDisplayColorPrimvar().Set([Gf.Vec3f(.3)]*len(mesh.GetPointsAttr().Get()))
    # Use an explicit constant material so an RTX vertex-color cache cannot
    # leave the previous result's colored distribution on an unavailable shape.
    material = UsdShade.Material.Define(stage, '/World/UnavailableMaterial')
    shader = UsdShade.Shader.Define(stage, '/World/UnavailableMaterial/Preview')
    shader.CreateIdAttr('UsdPreviewSurface')
    shader.CreateInput('diffuseColor', Sdf.ValueTypeNames.Color3f).Set(Gf.Vec3f(0))
    shader.CreateInput('emissiveColor', Sdf.ValueTypeNames.Color3f).Set(Gf.Vec3f(.3))
    shader.CreateOutput('surface', Sdf.ValueTypeNames.Token)
    material.CreateSurfaceOutput().ConnectToSource(shader.ConnectableAPI(), 'surface')
    UsdShade.MaterialBindingAPI.Apply(mesh.GetPrim()).Bind(material)


def update_scene(stage, surface, prediction, mode='AI', baseline=None, color_limits=None):
    if surface['node_ids'] != prediction['node_ids'] or surface['surface_version'] != prediction['surface_version']:
        raise ValueError('Node order or geometry differs')
    mesh = UsdGeom.Mesh.Get(stage, '/World/Hook')
    UsdShade.MaterialBindingAPI.Apply(mesh.GetPrim()).Bind(UsdShade.Material.Get(stage, '/World/FieldMaterial'))
    if mode not in ('AI', 'Displacement'):
        result = legacy_update(stage, surface, prediction, mode, baseline)
        return {**result, 'unit':'MPa', 'marker_meaning':'Full-node stress maximum',
                'color_min':result['color_min_mpa'], 'color_max':result['color_max_mpa']}
    vectors = prediction['displacement_mm']
    if len(vectors) != len(surface['node_ids']) or len(prediction['stress_mpa']) != len(vectors):
        raise ValueError('Result array length differs from surface')
    if mode == 'Displacement':
        values = [math.sqrt(sum(float(v)**2 for v in vector)) for vector in vectors]
        unit, title = 'mm', 'AI displacement magnitude'
        peak = prediction['full_displacement_peak_position_mm']
        peak_id = prediction['full_displacement_peak_node_id']
        peak_value = prediction['full_max_displacement_mm']
        meaning = 'Full-node displacement magnitude maximum'
    else:
        values = prediction['stress_mpa']
        unit, title = 'MPa', 'AI von Mises stress'
        peak = prediction['full_peak_position_mm']
        peak_id = prediction['full_peak_node_id']
        peak_value = prediction['full_max_stress_mpa']
        meaning = 'Full-node stress maximum'
    if not all(math.isfinite(float(v)) for v in values):
        raise ValueError('Nonfinite field value')
    lower, upper = (color_limits[mode] if color_limits else (0., max(float(peak_value), 1e-6)))
    if not math.isfinite(lower) or not math.isfinite(upper) or upper <= lower:
        raise ValueError('Color range must be finite and increasing')
    mesh = UsdGeom.Mesh.Get(stage, '/World/Hook')
    mesh.GetDisplayColorPrimvar().Set(colors(values, lower, upper))
    prim = mesh.GetPrim()
    prim.CreateAttribute('education:displayValues', Sdf.ValueTypeNames.FloatArray, custom=True).Set(values)
    prim.CreateAttribute('education:stressMPa', Sdf.ValueTypeNames.FloatArray, custom=True).Set(prediction['stress_mpa'])
    prim.CreateAttribute('education:displacementMM', Sdf.ValueTypeNames.Vector3fArray, custom=True).Set([Gf.Vec3f(*p) for p in vectors])
    prim.CreateAttribute('education:displacementMagnitudeMM', Sdf.ValueTypeNames.FloatArray, custom=True).Set(
        [math.sqrt(sum(float(v)**2 for v in vector)) for vector in vectors])
    metadata = dict(modelId=prediction['model_id'], statsSha256=prediction['stats_sha256'],
                    surfaceVersion=surface['surface_version'], caseId=surface['case_id'],
                    forceN=prediction['force_N'], thicknessMM=prediction['thickness_mm'],
                    matchingFEA=prediction['matching_fea'], displayMode=mode, displayUnit=unit,
                    displayTitle=title, colorMin=lower, colorMax=upper, stale=False,
                    markerMeaning=meaning, markerNodeId=peak_id, displacementApplied=False)
    for key, value in metadata.items():
        prim.SetCustomDataByKey(key, value)
    marker = UsdGeom.Xformable(stage.GetPrimAtPath('/World/Peak'))
    marker.GetOrderedXformOps()[0].Set(Gf.Vec3d(*peak))
    return dict(title=title, unit=unit, color_min=lower, color_max=upper,
                color_clipped_nodes=sum(v < lower or v > upper for v in values),
                marker_position_mm=peak, marker_node_id=peak_id,
                marker_value=peak_value, marker_meaning=meaning, mode=mode)
