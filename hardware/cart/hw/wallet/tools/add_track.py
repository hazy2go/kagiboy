#!/usr/bin/env python3
"""Add one hand-placed track polyline on a copper layer (KiCad Python). For short links the routers cannot
reach (e.g. a pin between two 0.4 mm pitch neighbours to its decoupling cap). DRC verifies afterwards.
Usage: add_track.py PCB NET LAYER WIDTH X0,Y0 X1,Y1 [X2,Y2 ...]
"""
import sys
import pcbnew

pcb, net, layer, w = sys.argv[1:5]
pts = [tuple(map(float, p.split(','))) for p in sys.argv[5:]]
b = pcbnew.LoadBoard(pcb)
n = b.FindNet(net)
if n is None:
    sys.exit(f'net {net} not on the board')
L = b.GetLayerID(layer)
for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
    t = pcbnew.PCB_TRACK(b)
    t.SetStart(pcbnew.VECTOR2I(pcbnew.FromMM(x0), pcbnew.FromMM(y0)))
    t.SetEnd(pcbnew.VECTOR2I(pcbnew.FromMM(x1), pcbnew.FromMM(y1)))
    t.SetWidth(pcbnew.FromMM(float(w)))
    t.SetLayer(L)
    t.SetNet(n)
    b.Add(t)
b.Save(pcb)
print(f'{net} on {layer}: {len(pts) - 1} segments {pts}')
