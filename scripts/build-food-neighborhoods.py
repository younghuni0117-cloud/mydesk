"""Project KOSTAT 2013 simplified 읍/면/동 GeoJSON into small, province-specific SVG data.
Source: https://github.com/southkorea/southkorea-maps/blob/master/kostat/2013/json/skorea_submunicipalities_geo_simple.json
Usage: python scripts/build-food-neighborhoods.py source.json
"""
import json,sys
from pathlib import Path
source=json.load(open(sys.argv[1]));groups={}
def project(p):return [round(400+(p[0]-127.8)*78,3),round(40+(38.8-p[1])*105,3)]
def area(r):return sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(r,r[1:]))/2
def center(r):
 a=area(r)
 if abs(a)<1e-8:return r[0]
 return [round(sum((p[i]+q[i])*(p[0]*q[1]-q[0]*p[1]) for p,q in zip(r,r[1:]))/(6*a),3) for i in range(2)]
for f in source['features']:
 p=f['properties'];code=str(p['code']);g=f['geometry'];polys=g['coordinates'] if g['type']=='MultiPolygon' else [g['coordinates']];rings=[[project(pt) for pt in ring] for poly in polys for ring in poly]
 outer=max([ [project(pt) for pt in poly[0]] for poly in polys],key=lambda r:abs(area(r)))
 xs=[pt[0] for r in rings for pt in r];ys=[pt[1] for r in rings for pt in r]
 d=''.join('M'+'L'.join(','.join(str(v) for v in pt) for pt in r)+'Z' for r in rings)
 row={'name':p['name'],'code':code,'d':d,'center':center(outer),'bounds':[min(xs),min(ys),max(xs),max(ys)]}
 groups.setdefault(code[:2],[]).append(row)
out=Path('assets/food-neighborhoods');out.mkdir(exist_ok=True)
for code,rows in groups.items():(out/(code+'.json')).write_text(json.dumps(rows,ensure_ascii=False,separators=(',',':')))
print(json.dumps({'provinces':len(groups),'neighborhoods':sum(map(len,groups.values())),'bytes':sum(p.stat().st_size for p in out.glob('*.json'))}))
