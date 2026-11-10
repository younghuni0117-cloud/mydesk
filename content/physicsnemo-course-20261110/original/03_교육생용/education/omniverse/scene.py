"""USD creation only; no ML/VTK dependencies are imported inside Kit."""
import math
from pxr import Gf, Sdf, UsdGeom, UsdShade


PALETTE = [(0.05, 0.12, 0.55), (0.0, 0.65, 0.85), (0.3, 0.9, 0.5), (1.0, 0.9, 0.15), (0.8, 0.03, 0.03)]


def colors(values, lower, upper, signed=False):
    result = []
    for value in values:
        if not math.isfinite(value):
            raise ValueError('Nonfinite display field')
        t = min(1.0, max(0.0, (value - lower) / max(upper - lower, 1e-12)))
        palette = [(0.05, 0.2, 0.9), (0.93, 0.93, 0.93), (0.9, 0.08, 0.05)] if signed else PALETTE
        z = t * (len(palette) - 1)
        i = min(int(z), len(palette) - 2)
        a = z - i
        result.append(Gf.Vec3f(*[palette[i][k] * (1-a) + palette[i+1][k] * a for k in range(3)]))
    return result


def create_scene(stage, surface):
    UsdGeom.SetStageMetersPerUnit(stage, 0.001)
    UsdGeom.SetStageUpAxis(stage, UsdGeom.Tokens.z)
    world = UsdGeom.Xform.Define(stage, '/World')
    stage.SetDefaultPrim(world.GetPrim())
    mesh = UsdGeom.Mesh.Define(stage, '/World/Hook')
    mesh.CreatePointsAttr([Gf.Vec3f(*point) for point in surface['points_mm']])
    mesh.CreateFaceVertexCountsAttr([3] * len(surface['triangles']))
    mesh.CreateFaceVertexIndicesAttr([i for face in surface['triangles'] for i in face])
    mesh.CreateSubdivisionSchemeAttr(UsdGeom.Tokens.none)
    mesh.CreateDoubleSidedAttr(True)
    mesh.GetDisplayColorPrimvar().SetInterpolation(UsdGeom.Tokens.vertex)
    mesh.GetPrim().CreateAttribute('education:nodeIds', Sdf.ValueTypeNames.Int64Array, custom=True).Set(surface['node_ids'])
    mesh.GetPrim().SetCustomDataByKey('surfaceVersion', surface['surface_version'])
    # A scientific colormap should not change with scene illumination.
    # Emissive vertex colors provide an explicit unlit display material.
    material = UsdShade.Material.Define(stage, '/World/FieldMaterial')
    shader = UsdShade.Shader.Define(stage, '/World/FieldMaterial/Preview')
    shader.CreateIdAttr('UsdPreviewSurface')
    shader.CreateInput('diffuseColor', Sdf.ValueTypeNames.Color3f).Set(Gf.Vec3f(0))
    reader = UsdShade.Shader.Define(stage, '/World/FieldMaterial/ColorReader')
    reader.CreateIdAttr('UsdPrimvarReader_float3')
    reader.CreateInput('varname', Sdf.ValueTypeNames.String).Set('displayColor')
    reader.CreateInput('fallback', Sdf.ValueTypeNames.Float3).Set(Gf.Vec3f(0.3))
    reader.CreateOutput('result', Sdf.ValueTypeNames.Float3)
    shader.CreateInput('emissiveColor', Sdf.ValueTypeNames.Color3f).ConnectToSource(reader.ConnectableAPI(), 'result')
    shader.CreateOutput('surface', Sdf.ValueTypeNames.Token)
    material.CreateSurfaceOutput().ConnectToSource(shader.ConnectableAPI(), 'surface')
    UsdShade.MaterialBindingAPI.Apply(mesh.GetPrim()).Bind(material)
    camera = UsdGeom.Camera.Define(stage, '/World/Camera')
    camera.CreateClippingRangeAttr(Gf.Vec2f(0.1, 100000))
    camera.CreateProjectionAttr(UsdGeom.Tokens.orthographic)
    # Camera apertures use tenths of a scene unit, including orthographic mode.
    camera.CreateHorizontalApertureAttr(3600)
    camera.CreateVerticalApertureAttr(2400)
    view = Gf.Matrix4d().SetLookAt(Gf.Vec3d(115, -145, 340), Gf.Vec3d(0, 17, 5), Gf.Vec3d(0, 1, 0))
    camera.AddTransformOp().Set(view.GetInverse())
    marker = UsdGeom.Sphere.Define(stage, '/World/Peak')
    marker.CreateRadiusAttr(2.0)
    marker.CreateDisplayColorAttr([Gf.Vec3f(1, 0.15, 0.85)])
    UsdShade.MaterialBindingAPI.Apply(marker.GetPrim()).Bind(material)
    marker.AddTranslateOp()
    return mesh


def update_scene(stage, surface, prediction, mode='AI', baseline=None):
    if surface['node_ids'] != prediction['node_ids'] or surface['surface_version'] != prediction['surface_version']:
        raise ValueError('Node order or geometry differs')
    nominal = prediction['matching_fea']
    if mode in ('FEA', 'AbsError') and not nominal:
        raise ValueError('No matching FEA for this force')
    if mode == 'FEA':
        values = surface['fea_stress_mpa']
        title = 'FEA stress (same-condition)'
        peak = surface['fea_full_peak_position_mm']
    elif mode == 'AI':
        values = prediction['stress_mpa']
        title = 'AI stress' if nominal else 'AI stress (observation; no matching FEA)'
        peak = prediction['full_peak_position_mm']
    elif mode == 'AbsError':
        values = [abs(a-b) for a,b in zip(prediction['stress_mpa'], surface['fea_stress_mpa'])]
        title = '|AI - FEA| stress (same-condition)'
        peak = prediction['full_peak_position_mm']
    elif mode == 'DeltaAI':
        if baseline is None or baseline['model_id'] != prediction['model_id'] or baseline['surface_version'] != prediction['surface_version']:
            raise ValueError('Baseline AI source differs')
        values = [a-b for a,b in zip(prediction['stress_mpa'], baseline['stress_mpa'])]
        title = 'AI stress - nominal AI (response; not FEA error)'
        peak = prediction['full_peak_position_mm']
    else:
        raise ValueError('Unknown display mode')
    if mode == 'DeltaAI':
        upper = max(max(abs(v) for v in values), 1e-6)
        lower = -upper
    elif mode == 'AbsError':
        lower, upper = 0.0, max(max(values), 1e-6)
    else:
        lower = 0.0
        upper = surface.get('fea_full_max_stress_mpa')
        if upper is None:
            upper = max(float(prediction['full_max_stress_mpa']), 1e-6)
    mesh = UsdGeom.Mesh.Get(stage, '/World/Hook')
    mesh.GetDisplayColorPrimvar().Set(colors(values, lower, upper, mode == 'DeltaAI'))
    prim = mesh.GetPrim()
    prim.CreateAttribute('education:displayValuesMPa', Sdf.ValueTypeNames.FloatArray, custom=True).Set(values)
    prim.CreateAttribute('education:stressMPa', Sdf.ValueTypeNames.FloatArray, custom=True).Set(prediction['stress_mpa'])
    prim.CreateAttribute('education:displacementMM', Sdf.ValueTypeNames.Vector3fArray, custom=True).Set([Gf.Vec3f(*p) for p in prediction['displacement_mm']])
    metadata = {'modelId': prediction['model_id'], 'statsSha256': prediction['stats_sha256'],
                'surfaceVersion': surface['surface_version'], 'caseId': surface['case_id'],
                'forceN': prediction['force_N'], 'thicknessMM': prediction['thickness_mm'],
                'matchingFEA': nominal, 'displayMode': mode, 'displayTitle': title,
                'colorMinMPa': lower, 'colorMaxMPa': upper, 'stale': False,
                'markerMeaning': 'full-node maximum of FEA in FEA view; full-node maximum of AI in other views'}
    for key, value in metadata.items():
        prim.SetCustomDataByKey(key, value)
    marker = UsdGeom.Sphere.Get(stage, '/World/Peak')
    UsdGeom.Xformable(marker).GetOrderedXformOps()[0].Set(Gf.Vec3d(*peak))
    return {'title': title, 'color_min_mpa': lower, 'color_max_mpa': upper,
            'color_clipped_nodes': sum(v < lower or v > upper for v in values),
            'marker_position_mm': peak, 'mode': mode}
