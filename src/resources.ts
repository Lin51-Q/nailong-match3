export const EXPRESSIONS = [
  { id: 'chill', name: '呆呆龙', mark: '●', color: '#ffd36f', pale: '#fff2b7' },
  { id: 'think', name: '思考龙', mark: '◆', color: '#78cdb5', pale: '#dcf5e9' },
  { id: 'smug', name: '得意龙', mark: '★', color: '#a49ae0', pale: '#eee7ff' },
  { id: 'happy', name: '快乐龙', mark: '♥', color: '#efb075', pale: '#ffead2' },
  { id: 'laugh', name: '狂笑龙', mark: '✦', color: '#88bbeb', pale: '#deefff' },
  { id: 'pink', name: '粉粉龙', mark: '✿', color: '#eb95b3', pale: '#ffe2ed' },
]
export const assetUrl = (id: string) => `${import.meta.env.BASE_URL}assets/${id}.webp`
export async function loadResources(): Promise<Map<string, HTMLImageElement>> {
  const entries = await Promise.all([...EXPRESSIONS.map(x => x.id), 'hero', 'rainbow'].map(async id => {
    const image = new Image()
    image.src = assetUrl(id)
    await image.decode()
    return [id, image] as const
  }))
  return new Map(entries)
}
