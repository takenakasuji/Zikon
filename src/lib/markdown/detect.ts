const BLOCK = /(^|\n)\s{0,3}(#{1,6} |[-*+] |\d+\. |> |```|\|.*\|)/
const INLINE = /\[[^\]\n]+\]\([^)\n]*\)|\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|`[^`\n]+`/

/** プレーンテキスト貼り付けをマークダウンとして解釈すべきか（素の文章/URLは除外）。 */
export function looksLikeMarkdown(text: string): boolean {
  return BLOCK.test(text) || INLINE.test(text)
}
