# Zikon UI ＆ マークダウン入力体験 オーバーホール — 設計書

- **日付**: 2026-06-03
- **ステータス**: 承認済み（実装計画 待ち）
- **対象**: 全UI ＋ マークダウン入力体験を「静かで信頼できる最高の執筆ツール」へ

---

## 1. 背景と現状

Zikon は Tauri 2 + Next.js 16（app router / static export）+ React 19 + TipTap 3（ProseMirror）+ Zustand + Tailwind 4 で作られたローカルファースト型マークダウンノートアプリ。ドキュメントはユーザーが選んだワークスペースフォルダ内の `.md` として保存される。「Kura（蔵）」＝保存済み一覧、「Zen」＝単一ドキュメント編集ビュー、`.drafts/` に下書き、`.stash/` に退避。`/` スラッシュコマンドでブロック挿入・保存・退避、選択でバブルメニュー。

8体のエージェントによる読み取り専用監査（`docs` 外、`tasks/w5f8mqn26.output` に全文）で、以下が判明した。

### 1.1 データ消失クラス（最優先）
1. **往復変換で未対応ノードが静かに消える** — `src/lib/markdown/fromMarkdown.ts:77` が未対応ブロックを `null` で破棄。`remark-gfm` が解析するテーブル/HTML/脚注が、ファイルを開いた瞬間→次の自動保存(600ms)で消える（編集不要・警告なし）。テーブルは空ドキュメントに化けると実証済み。インラインHTMLも `convertInline` の default で素テキスト化。
2. **シリアライズ時のエスケープ皆無** — `src/lib/markdown/toMarkdown.ts:104` 周辺。本文の `# `・`* `・素のURL が再読込で見出し/箇条書き/自動リンクに化ける。先頭が `# ` の段落は H1 に昇格し、`extractFirstH1` 経由で**ファイル名まで書き換わる**。
3. **永続化の脆さ** — (a) 600ms デバウンスが unmount/遷移/クローズで**フラッシュされず最後の編集を喪失**（Tauri `onCloseRequested` 不在）。(b) Rust `rename` が**衝突先を無言で上書き**。(c) `generateId`（6桁 base36・時刻由来）が連続作成で衝突。(d) `updateActiveContent` が fire-and-forget で**直列化されず**、競合で孤立/重複ファイルが発生しうる。(e) ほぼ全 fs エラーが握り潰される。

### 1.2 当たり前機能の欠落
検索が皆無 / コマンドパレット・`Cmd+S`/`Cmd+N` なし / 保存状態の表示なし / 明示的タイトル欄なし（「無題」固定）/ **マークダウン貼付けが解釈されない** / リンクが `window.prompt` / 画像が base64 で `.md` 直書き / 下書きが Kura に出ない。

### 1.3 ポリッシュ不足（“AIが作った感”）
浮遊面の影が無効（`shadow-lg` がネイビー上で不可視）＆背景が本文と同色 / 行間・見出し余白が窮屈で不揃い / 角丸バラバラ / 絵文字アイコンが浮く / **focus-visible 皆無（アクセシビリティ0層）** / ネイティブ `confirm`/`prompt` がテーマを破壊 / ライトテーマなし。

---

## 2. 決定事項（ユーザー承認済み）

| 論点 | 決定 |
|---|---|
| 範囲 | **全部（データ安全性込み）** — UI ＋ 編集体験 ＋ データ消失バグまで直す |
| 方向性 | **静かな執筆ツール**（iA Writer / Bear 系）。リッチブロックは増やさず入力体験に全振り |
| MD変換 | **実績ライブラリへ置換**（mdast 双方向パイプライン） |
| テーマ | **OS追従 ＋ 手動トグル**（dark/light 両対応） |
| フェーズ | **データ安全(P0) を最優先 → 見た目(P4) を最後に**。各フェーズでレビュー |
| テーブル | **消失防止のため round-trip と表示は対応。高度な表編集UIは作らない** |
| 三状態モデル | draft/Kura/Stash は**「見える化」して残す**（簡素化は今回スコープ外） |

---

## 3. 設計原則

1. **データを絶対に失わない** — 見た目より先に、開く/閉じる/保存の信頼性を担保。
2. **静かな執筆体験** — 余白・タイポグラフィ・集中。入力の気持ちよさを最優先。
3. **`.md` はクリーンに保つ** — 他エディタでも開ける素直なマークダウン。base64画像やノイズ差分を出さない。
4. **既存トークン設計を活かす** — `var(--*)` 前提なのでテーマ拡張・ポリッシュは CSS 中心で効く。

---

## 4. アーキテクチャ

### 4.1 マークダウン変換: mdast 双方向パイプライン
**単一の中間表現 mdast** に統一し、自作シリアライザを廃止する。

- **読込**: `markdown → mdast (unified + remark-parse + remark-gfm) → TipTap JSON`
  - 既存 `convertBlock`/`convertInline`（`fromMarkdown.ts`）を拡張。
  - **未対応ノードは捨てない**: `table` 等は対応ノードへ、想定外ノードは `rawHtml`/`rawBlock` のような温存ノードに退避し、保存時にそのまま書き戻す。
  - link/image の `title`、`node.meta`（コードフェンス情報）を保持。**見出しは StarterKit の `heading.levels` を 1–6 に拡張**して H4–H6 のクランプ消失をなくす（表示スタイルは控えめに段階付け）。
- **保存**: `TipTap JSON → mdast → markdown (unified + remark-gfm + remark-stringify)`
  - `src/lib/markdown/toMarkdown.ts`（手書き）を**廃止**し、`tiptapToMdast(json): mdast` ＋ `processor.stringify(tree)` に置換。
  - エスケープ・テーブル・ネスト引用・自動リンク（text===urlは素URLで出力）・ブロック間スペースが正しくなる。
- **依存追加**: `remark-stringify`（mdast-util-to-markdown を内包）。テーブル round-trip 用に `remark-gfm` は両方向で使用。
- **テーブル**: TipTap の table 拡張（`@tiptap/extension-table*`）を導入して**表示＋基本編集＋round-trip**を担保。リッチな表編集UIは作らない。

### 4.2 永続化の安全化（`workspaceStore.ts` ＋ Rust）
- **直列書き込みキュー**: store 内に `let pending = pending.then(() => task())` 形式の単一チェーンを設け、rename→write を**原子的**に。`oldPath` は常に最新 state からタスク内で算出。
- **フラッシュ**: `NotionEditor` の cleanup で**保留中タイマーを破棄せずフラッシュ**（`tiptapToMarkdown(editor.getJSON())` を同期計算 → 書込）。editor `blur` でもフラッシュ。Tauri `getCurrentWindow().onCloseRequested` ハンドラを追加し、クローズ前に active をフラッシュ。
- **rename 衝突回避**: Rust 側 `rename_document` で `dst.exists()` を確認し、別ドキュメントを無言上書きしない（区別可能なエラー or 採番）。`save`/`stash`/`restore` の各経路に適用。
- **id 強化**: `generateId` を `crypto.randomUUID()` 由来へ。新規 draft 作成時に既存ファイル名と衝突しないことを確認。
- **エラー表面化**: `updateActiveContent` の空 catch を **NotFound（新規draftで元ファイル未存在）限定**に絞り、それ以外は伝播。書込/リネーム失敗をトースト＋保存ステータスで通知。
- **saveActive の整合**: rename 成功後にのみ `state: 'saved'` へ遷移（失敗時は draft のまま）。
- **空draftの掃除**: stash/createNew 時に空の旧 draft ファイルを削除し、`.drafts/` に孤児を残さない。
- **外部変更の検知（軽量）**: open 時 mtime を記録し、書込前に再stat して新しければ警告（上書き/再読込の選択）。本格的な競合解決UIはスコープ外。

### 4.3 ドキュメントタイトルを第一級フィールドに
- エディタ上部に **専用タイトル欄**（Bear/Notes/Notion 風）。タイトルがファイル名の source of truth。
- 本文の `# `（特にコードブロック内）に**乗っ取られない**。タイトルは parsed doc model から導出し、生正規表現での `extractFirstH1` 依存をやめる。
- ファイル名は `<sanitized-title>_<id>.md` を維持（ローカルファーストの人間可読性）。ただし**リネームは idle/blur 時のみ**・衝突安全に。`sanitizeTitle` を**コードポイント単位**で切り詰め、末尾ドット/空白除去、予約名対策。

### 4.4 画像パイプライン
- ドロップ＋**ペースト**両対応。base64 直書きを廃止し、ワークスペースの `assets/` に保存して**相対パス参照** `![](assets/xxx.png)`。
- サイズガードと失敗時のフィードバック。alt 編集・削除の最小ツールバー。

### 4.5 テーマ（dark / light）
- 既存セマンティックトークン（`--background`/`--foreground`/`--muted`/…）に **light セット**を追加。`@media (prefers-color-scheme)` で OS 追従 ＋ store 永続の手動トグル（`[data-theme]`）。
- シンタックスハイライトの light パレットを用意。`color-scheme` のハードコードを解除。

### 4.6 アクセシビリティ ＆ ダイアログ基盤（全フェーズ横断）
- **focus-visible をグローバルに**（`:where(button,a,[tabindex],input,[role=button]):focus-visible { outline: 2px solid var(--primary); outline-offset: 2px }`）。
- アイコンのみボタンに `aria-label`、トグルマークに `aria-pressed`、装飾グリフに `aria-hidden`。スラッシュメニューに listbox/option + `aria-activedescendant`。
- **`window.confirm`/`window.prompt` を全廃**し、テーマ付き **alertdialog（フォーカストラップ／Esc・Enter）＋ トースト** に置換。削除は soft-delete + 取り消しトーストを検討。
- バブルメニューをキーボード到達可能に（`Cmd+E` コード・`Cmd+Shift+S` 取消線・`Cmd+K` リンク等）。

---

## 5. 実装フェーズ

各フェーズ末でレビューチェックポイント。P0 を最優先、P4 を最後に。

### P0 — データ安全基盤（最優先）
- mdast 双方向パイプライン化（`fromMarkdown` 拡張・`toMarkdown` を mdast stringify へ置換・未対応ノード温存・テーブル拡張導入）。
- 往復／冪等性のプロパティテスト追加（§7）。
- 書込キュー直列化・autosave フラッシュ（unmount/blur/`onCloseRequested`）。
- Rust rename 衝突回避・`generateId` 強化・空 draft 掃除。
- fs エラーの表面化（catch 限定＋トースト土台）。

### P1 — 信頼と同一性
- 保存ステータスインジケータ（保存中／保存しました HH:MM／保存失敗）を Zen ヘッダに。
- ドキュメントタイトル欄（H1 から分離）。
- draft/saved 状態バッジ。Kura に**下書きを表示**。生ファイル名の露出をやめる。
- 安全な stash 復元（復元前に現 draft をフラッシュ／保全、トースト通知）。
- bootstrap/openFile のエラー区別とリトライ（「未設定」と「読込失敗」を区別）。

### P2 — マークダウン入力体験（中核）
- **MD 貼付けの解釈**（`editorProps.clipboardTextParser` に `markdownToTiptap` を接続）。
- **リンクポップオーバー**（`window.prompt` 置換、URL正規化、選択保持、解除ボタン、URL貼付けで自動リンク）。
- 画像 assets 化（§4.4）。
- スラッシュメニュー整理（Basic blocks / Lists / Media / Actions の**区分け**、破壊的アクション前に区切り、コードブロック内では `/` を抑制、絵文字→アイコン）。
- バブルメニュー拡充（見出し化／クリア書式／**ハイライト** `==` 対応）＋ ショートカット表示。
- 常時オートフォーカス（非空は `end`、空 draft は `start`）。ブロック別プレースホルダ。
- StarterKit 同梱 link/underline の重複解消（`StarterKit.configure({ link:false, underline:false, ... })`）。**underline は無効化に決定**（マークダウンにネイティブ表現がなく、`<u>` 直書きは「クリーンな `.md`」原則に反するため。`Cmd+U` のアフォーダンス自体を出さない）。

### P3 — 当たり前機能（スケール）
- Kura の検索ボックス（タイトル＋本文）。
- 本文内 `Cmd+F` 検索（できれば置換）。
- `Cmd+K` コマンドパレット（新規/保存/退避/最近を開く/ビュー切替/検索/ワークスペース切替）。
- `Cmd+S` 保存・`Cmd+N` 新規。Save を可視ボタンにも（スラッシュ専用をやめる）。

### P4 — 静かな執筆の見た目（最後）
- 浮遊面の **elevation トークン**（`--shadow-popover`）＋ **`--popover`/サーフェストークン**（本文より一段明るい色）を全ポップオーバーに統一適用。
- 編集面の**縦リズム**（段落 margin と clickアフォーダンス padding の分離）と**見出し余白**を整数比で再設計。
- 角丸トークン（`--radius` / `--radius-sm`）。
- アイコンを lucide 等の monoline（currentColor）に統一。バブル/スラッシュのアイコン扱いを統一。
- ライトテーマ実装（§4.5）。JP/EN 混植に最適な本文フォントスタック。
- 引用（faded をやめ border＋淡tint）、空状態の統一パターン、サイドバーの active 明確化、微アニメ（120–150ms の fade+scale、ビュー遷移）。
- （任意）フォーカスモード／タイプライタースクロール／幅・文字サイズ設定。

### A11y（全フェーズ横断）
focus-visible、ARIA、テーマ付きダイアログ／トースト、キーボード到達性（§4.6）。各フェーズの該当UIに織り込む。

---

## 6. スコープ外（今回やらない）
- Notion 式ブロックハンドル（ドラッグ / ＋ / ⋮⋮）。
- テーブルの高度編集UX（round-trip と表示・基本編集は対応）。
- 共同編集・クラウド同期・バージョン履歴。
- draft/Kura/Stash 三状態モデルの作り替え（可視化はするが構造は維持）。

---

## 7. テスト方針
- 往復（md → tiptap → md）と**冪等性**（2周して安定）のプロパティテストを追加。
- カバー対象: table / ブロックHTML・インラインHTML / ネスト＆複数段落引用 / link・image の title / 自動リンク / H4–H6 / **先頭 `#` の段落が見出しに昇格しないこと** / 各種エスケープ / コードフェンス言語＋meta / ハードブレイク / 連続空行。
- 永続化: rename 衝突時に別ファイルを上書きしないこと、autosave フラッシュ、空 draft 掃除のテスト。
- 現状 `fromMarkdown.test.ts` はハッピーパスのみで全データ消失バグがすり抜けている → 是正。

---

## 8. リスクと留意点
- **Next.js 16 はカスタム版**（`AGENTS.md`）。実装前に `node_modules/next/dist/docs/` の該当ガイドを必ず確認し、deprecation に従う。
- TipTap 3 のテーブル拡張・bubble menu API は破壊的変更があり得る。実装時にバージョンの API を確認。
- mdast 置換は P0 の山場。`rawHtml` 温存ノードの ProseMirror スキーマ表現を慎重に設計（編集不可・選択可のアトムなど）。
- ファイル名リネーム方針の変更は外部ファイルウォッチャ／同期フォルダ挙動に影響。idle リネーム＋衝突安全で churn を最小化。

---

## 9. 完了の定義
- P0 完了時点で、テーブル/HTML を含む手書き `.md` を開いて閉じてもデータが失われない（テストで保証）。
- 通常のクローズ／画面遷移で直近編集が失われない。
- 全インタラクティブ要素に可視フォーカス、ネイティブ `confirm`/`prompt` がゼロ。
- dark/light 両テーマで破綻なし。
- マークダウン貼付けがブロックに解釈され、リンク挿入がアプリ内ポップオーバーで完結する。
