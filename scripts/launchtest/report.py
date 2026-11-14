"""Launch test report: joins the k6 summaries of every runner into one markdown table (run summary).
Usage: python3 report.py DIR PEAK"""
import glob, json, os, re, sys

out, peak = sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else '?'
files = sorted(glob.glob(os.path.join(out, 'summary-*.json')))
if not files:
    print('## Launch test\n\nNo runner finished (no k6 summaries). See the k6 job logs.')
    sys.exit(0)
calls, errs, tot = {}, {}, {}
for f in files:
    m = json.load(open(f)).get('metrics', {})
    for k, v in m.items():
        g = re.match(r'(call_ms|call_errors)\{call:(\w+)\}$', k)
        if g and g.group(1) == 'call_ms' and v.get('count'):
            c = calls.setdefault(g.group(2), {'n': 0, 'sum': 0.0, 'p95': 0.0, 'max': 0.0})
            c['n'] += v['count']; c['sum'] += v['avg'] * v['count']
            c['p95'] = max(c['p95'], v.get('p(95)', 0)); c['max'] = max(c['max'], v.get('max', 0))
        elif g:
            e = errs.setdefault(g.group(2), [0, 0])
            e[0] += v.get('passes', 0); e[1] += v.get('passes', 0) + v.get('fails', 0)
    for k in ('supabase_bytes', 'http_reqs', 'iterations'):
        if k in m: tot[k] = tot.get(k, 0) + m[k].get('count', 0)
    for k in ('files_ms',):
        if k in m and m[k].get('count'):
            t = tot.setdefault(k, {'n': 0, 'sum': 0.0, 'p95': 0.0})
            t['n'] += m[k]['count']; t['sum'] += m[k]['avg'] * m[k]['count']; t['p95'] = max(t['p95'], m[k].get('p(95)', 0))
    if 'files_errors' in m:
        fe = tot.setdefault('files_errors', [0, 0]); v = m['files_errors']
        fe[0] += v.get('passes', 0); fe[1] += v.get('passes', 0) + v.get('fails', 0)
    vm = m.get('vus_max', {}).get('value') or m.get('vus', {}).get('max') or 0
    tot['vus'] = tot.get('vus', 0) + vm

print(f'## Launch test: {len(files)} of 4 runners, spike of {peak} virtual players\n')
print(f"Requests: {tot.get('http_reqs', 0):,} · player sessions started: {tot.get('iterations', 0):,} · "
      f"most virtual players at once (sum of runners): {int(tot['vus']):,} · "
      f"pulled from Supabase: {tot.get('supabase_bytes', 0) / 1e6:,.1f} MB\n")
if 'files_ms' in tot:
    f, fe = tot['files_ms'], tot.get('files_errors', [0, 1])
    print(f"Files from Cloudflare: {f['n']:,} · average {f['sum'] / f['n']:.0f} ms · 95 % under {f['p95']:.0f} ms · "
          f"errors {100 * fe[0] / max(1, fe[1]):.2f} %\n")
print('| Call | Calls | Average ms | 95 % under ms | Slowest ms | Errors |')
print('|---|---:|---:|---:|---:|---:|')
bad = []
for name, c in sorted(calls.items(), key=lambda x: -x[1]['sum']):
    e = errs.get(name, [0, 0]); rate = 100 * e[0] / max(1, e[1])
    avg = c['sum'] / c['n']
    if rate > 1 or c['p95'] > 1500: bad.append(name)
    print(f"| {name} | {c['n']:,} | {avg:.0f} | {c['p95']:.0f} | {c['max']:.0f} | {rate:.2f} % |")
n = sum(c['n'] for c in calls.values())
if n:
    print(f"| **all** | **{n:,}** | **{sum(c['sum'] for c in calls.values()) / n:.0f}** | | | "
          f"**{100 * sum(e[0] for e in errs.values()) / max(1, sum(e[1] for e in errs.values())):.2f} %** |")
print('\n' + ('Over the line (errors > 1 % or 95 % > 1.5 s): ' + ', '.join(bad) if bad else 'Every call held: errors ≤ 1 %, 95 % under 1.5 s.'))
