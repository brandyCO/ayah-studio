// The Learn tab's addresses (#/learn…), resolved here so the app's first download carries one import only.
//   #/learn                 the path            #/learn/N[/tasmi]   a lesson of surah N
//   #/learn/garden          Your garden         #/learn/tree/N      surah N's tree up close
//   #/learn/pages[/J]       page memory map     #/learn/page/P      page P (line starts, quiz, recite)
export async function learnRoute(screen: HTMLElement, a?: string, b?: string): Promise<() => void> {
  if (Number(a)) return (await import('./lesson')).showLesson(screen, Number(a), b);
  if (a === 'garden') return (await import('./learnPath')).showYourGarden(screen);
  if (a === 'tree') return (await import('./treeView')).showTreeView(screen, b ?? '1');
  if (a === 'pages') return (await import('./pageMemory')).showPageMap(screen, b);
  if (a === 'page') return (await import('./pageMemory')).showPageDrill(screen, b ?? '1');
  return (await import('./learnPath')).showPath(screen);
}
