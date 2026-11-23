// The Learn tab's addresses (#/learn…), resolved here so the app's first download carries one import only.
//   #/learn                 the path            #/learn/N[/tasmi]   a lesson of surah N
//   #/learn/hifz            the Hifz shelf (old links #/learn/garden and #/learn/tree/N land there too)
//   #/learn/pages[/J]       page memory map     #/learn/page/P      page P (line starts, quiz, recite)
//   #/learn/review          teachers label the harakat clips learners shared
export async function learnRoute(screen: HTMLElement, a?: string, b?: string): Promise<() => void> {
  if (Number(a)) return (await import('./lesson')).showLesson(screen, Number(a), b);
  if (a === 'hifz' || a === 'garden' || a === 'tree') return (await import('./learnPath')).showHifzShelf(screen);
  if (a === 'pages') return (await import('./pageMemory')).showPageMap(screen, b);
  if (a === 'page') return (await import('./pageMemory')).showPageDrill(screen, b ?? '1');
  if (a === 'review') return (await import('./harakatReview')).showHarakatReview(screen);
  return (await import('./learnPath')).showPath(screen);
}
