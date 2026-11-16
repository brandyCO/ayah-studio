#!/usr/bin/env python3
"""Reciter health check (owner request 2026-11-16, "check the reciters").

Every recording in src/data/reciters.ts: each mp3quran surah file answers 200 with the exact size its
public/data/mp3quran doc expects and is not redirected (mp3quran redirects surahs a reciter lacks to
someone else; archive.org's own redirect is allowed); everyayah folders answer for a spread of ayat;
Quran.com recordings have their timings and audio for all 114 surahs; word files exist for every
`words` range; every mp3quran and Quran.com recording has a basmala.json entry.
Run by .github/workflows/reciter-health.yml (the build container cannot reach Quran.com / archive.org).
Usage: python3 scripts/reciter-health.py problems.json   (exit 1 when anything is wrong)
"""
import re, json, os, ssl, sys, urllib.request, urllib.error, concurrent.futures as cf
R=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src=open(R+'/src/data/reciters.ts').read()
CA=os.environ.get('CA_BUNDLE')
ctx=ssl.create_default_context(cafile=CA) if CA else ssl.create_default_context()
class NoRedir(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*a,**k): return None
op=urllib.request.build_opener(NoRedir,urllib.request.HTTPSHandler(context=ctx),urllib.request.ProxyHandler())
def head(url):
    for i in range(3):
        try:
            r=op.open(urllib.request.Request(url,method='HEAD',headers={'User-Agent':'Mozilla/5.0'}),timeout=30)
            return r.status,int(r.headers.get('Content-Length') or -1),None
        except urllib.error.HTTPError as e:
            if e.code in (301,302,303,307,308): return e.code,-1,e.headers.get('Location')
            if e.code>=500 and i<2: continue
            return e.code,-1,None
        except Exception as e:
            if i==2: return 0,-1,str(e)
def rng(s):
    out=[]
    for p in s.split(','):
        a,_,b=p.partition('-'); out+=range(int(a),int(b or a)+1)
    return out
recs=[]
for line in src.splitlines():
    m=re.search(r"\{ id: (\d+), name: '([^']*)'",line)
    if not m: continue
    r={'id':int(m[1]),'name':m[2],'line':line}
    if (x:=re.search(r"everyayah: '([^']+)'",line)): r['ea']=x[1]
    if (x:=re.search(r"mp3quran: \{ read: '?([\w-]+)'?, surahs: '([^']+)'",line)): r['mq']=(x[1],x[2])
    if (x:=re.search(r"words: '([^']+)'",line)): r['words']=x[1]
    r['qdc']='qdc: false' not in line
    recs.append(r)
print(len(recs),'recordings')
bas=json.load(open(R+'/public/data/basmala.json'))
probs=[]; jobs=[]
for r in recs:
    wk=str(r['mq'][0]) if 'mq' in r else str(r['id'])
    if 'words' in r and not r['qdc']:
        for s in rng(r['words']):
            if not os.path.exists(f"{R}/public/data/words/{wk}/{s:03d}.json"): probs.append((r['id'],r['name'],'missing words file',s))
    if 'mq' in r:
        p=f"{R}/public/data/mp3quran/{r['mq'][0]}.json"
        if not os.path.exists(p): probs.append((r['id'],r['name'],'no mp3quran doc','')); continue
        d=json.load(open(p))
        if str(r['mq'][0]) not in bas: probs.append((r['id'],r['name'],'no basmala entry',''))
        for s in rng(r['mq'][1]):
            e=d['surahs'].get(str(s))
            if not e: probs.append((r['id'],r['name'],'surah not in doc',s)); continue
            url=e.get('url') or f"{d['folder']}{s:03d}.mp3"
            jobs.append((r,s,url,e.get('size')))
    elif r['qdc'] and r['id']<1000:
        if f"qdc{r['id']}" not in bas: probs.append((r['id'],r['name'],'no basmala entry',''))
        for s in range(1,115): jobs.append((r,s,'qdc',None))
    if 'ea' in r and not r['qdc'] or ('ea' in r and r['id']<1000):
        for s,a in [(1,1),(2,286),(36,83),(78,40),(114,6)]:
            jobs.append((r,(s,a),f"https://everyayah.com/data/{r['ea']}/{s:03d}{a:03d}.mp3",None))
print(len(jobs),'files to check')
def qdc(r,s):
    u=f"https://api.qurancdn.com/api/qdc/audio/reciters/{r['id']}/audio_files?chapter={s}&segments=true"
    for i in range(3):
        try:
            d=json.load(urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'Mozilla/5.0'}),context=ctx,timeout=40))
            break
        except Exception as e:
            if i==2: return (r['id'],r['name'],f'timings API {e}',s,u)
    f=(d.get('audio_files') or [None])[0]
    if not f: return (r['id'],r['name'],'no audio file',s,u)
    vt=f.get('verse_timings') or []
    if not vt: return (r['id'],r['name'],'no verse timings',s,u)
    noseg=[v['verse_key'] for v in vt if not v.get('segments')]
    st,ln,loc=head(f['audio_url'])
    if st!=200: return (r['id'],r['name'],f'HTTP {st} {loc or ""}',s,f['audio_url'])
    if noseg and not (r['id']==173 and noseg==['1:1']): return (r['id'],r['name'],f'no word timings {noseg[:5]}',s,u)
    return None
def run(j):
    r,s,url,size=j
    if url=='qdc': return qdc(r,s)
    st,ln,loc=head(url)
    if loc and 'archive.org' in url and st in (301,302,303,307,308):
        st2,ln2,loc2=head(loc) if loc.startswith('http') else (0,-1,loc)
        while loc2 and st2 in (301,302,303,307,308): st2,ln2,loc2=head(loc2)
        st,ln,loc=st2,ln2,None
    bad=None
    if st!=200: bad=f'HTTP {st} {loc or ""}'
    elif size and ln!=size: bad=f'size {ln} != {size}'
    return (r['id'],r['name'],bad,s,url) if bad else None
with cf.ThreadPoolExecutor(48) as ex:
    for i,res in enumerate(ex.map(run,jobs)):
        if res: probs.append(res)
json.dump(probs,open(sys.argv[1],'w'),indent=0,default=str)
print(len(probs),'problems')
from collections import Counter
print(Counter((p[0],p[1],str(p[2])[:20]) for p in probs).most_common(60))

sys.exit(1 if probs else 0)
