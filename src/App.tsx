import { batch, createMemo, createSignal, For, onMount, Show } from "solid-js";
import { Chessboard } from "./components/Chessboard";

import wasm_url from './assets/wasm/hopefox.wasm?url'
import { fen_pos, makeSan, piece, piece_c_to_piece, Position, PositionManager, RelationManager, relations, square, WHITE } from 'hopefox'
import { makePersisted } from "@solid-primitives/storage";
import { createStore } from "solid-js/store";

let m = await PositionManager.make(() => wasm_url)

export default function App() {

  let [program, set_program] = makePersisted(createSignal(''), {
    name: 'program'
  })

  let [get_relations, set_relations] = createSignal<RelationManager[]>([])

  let fen = () => 'r2q1rk1/p1p1bppp/2pp2b1/4p3/4n1PN/2NP3P/PPP2PK1/R1BQ1R2 w - - 0 12'

  const on_program_changed = (rules: string) => {

    set_program(rules)

    try {
      let pos = m.create_position(fen())
      let res = relations(m, pos, program())
      set_relations([...res.values()])
    } catch (e) {

      console.error(e)
    }
  }

  onMount(() => {
    on_program_changed(program())
  })

  return (<>
    <h1 class='text-3xl inter-500'>Mor Chess 4</h1>

    <div class='flex p-2 gap-2'>
      <div class='flex-2'>
        <Editor/>
      </div>
      <div class='flex-2 max-h-100'>
        <div class='flex flex-col'>
          <For each={get_relations()}>{ relation => 
            <div class=''>
              <Relation fen={fen()} relation={relation}></Relation>
            </div>
          }</For>
        </div>
      </div>
      <div class='flex-2'>
        <Chessboard fen={fen()}/>
      </div>
    </div>
  </>)
}


type Line = { content: string }
type Mode = 'normal' | 'edit'

type Motion = 'delete' | null

type EditorState = {
  motion: Motion,
  mode: Mode,
  i_line: number,
  i_cursor: number,
  lines: Line[]
}

function Editor() {
  let first_line: Line = { content: 'hello' }

  const [state, set_state] = createStore<EditorState>({
    motion: null,
    mode: 'normal',
    i_line: 0,
    i_cursor: 0,
    lines: [first_line]
  })

  const clamp_cursor_to_line = () => {
    if (state.i_line < 0) {
      set_state('i_line', 0)
    }
    if (state.i_line >= state.lines.length) {
      set_state('i_line', state.lines.length - 1)
    }
    if (state.i_cursor >= state.lines[state.i_line].content.length) {
      set_state('i_cursor', state.lines[state.i_line].content.length - 1)
    }
    if (state.i_cursor < 0) {
      set_state('i_cursor', 0)
    }
  }

  const edit_break_line = () => {
    let content = state.lines[state.i_line].content.slice(0, state.i_cursor)
    let new_content = state.lines[state.i_line].content.slice(state.i_cursor)

    batch(() => {
      set_state('lines', state.i_line, 'content', content)
      set_state('lines', lines => 
        lines.toSpliced(state.i_line + 1, 0, { content: new_content })
      )
      set_state('i_line', state.i_line + 1)
      set_state('i_cursor', 0)
    })
  }

  const delete_text_forward = () => {
    let content = state.lines[state.i_line].content
    let new_content = content.slice(0, state.i_cursor + 1) + content.slice(state.i_cursor + 2)

    batch(() => {
      set_state('lines', state.i_line, 'content', new_content)
    })
  }

  const delete_full_line = () => {
    batch(() => {
      if (state.lines.length === 1) {
        set_state('lines', [{ content: 'hello' }])
        return
      }
      set_state('lines',
        lines => lines.toSpliced(state.i_line, 1))
        clamp_cursor_to_line()
    })
  }

  const delete_text_backspace = () => {
    let content = state.lines[state.i_line].content
    let new_content = content.slice(0, state.i_cursor) + content.slice(state.i_cursor + 1)

    batch(() => {
      set_state('lines', state.i_line, 'content', new_content)
      set_state('i_cursor', state.i_cursor - 1)
    })
  }

  const insert_text = (key: string) => {
    let content = state.lines[state.i_line].content
    let new_content = content.slice(0, state.i_cursor + 1) + key + content.slice(state.i_cursor + 1)

    batch(() => {
      set_state('lines', state.i_line, 'content', new_content)
      set_state('i_cursor', state.i_cursor + 1)
    })
  }

  const handle_key_down = (e: KeyboardEvent) => {
    let handled = false
    if (state.mode === 'edit') {
      handled = edit_mode(e.key, e.ctrlKey)
    } else if (state.mode === 'normal') {
      handled = normal_mode(e.key)
    }
    if (handled) {
      e.preventDefault()
    }
  }

  const enter_delete_motion = () => {

    if (state.motion === 'delete') {
      batch(() => {
        set_state('motion', null)
      })
      delete_full_line()
    } else {
        set_state('motion', 'delete')
    }
  }

  const normal_mode = (key: string) => {
    switch (key) {
      case 'd':
        enter_delete_motion()
        break
      case 'x':
        delete_text_forward()
        break
      case 'Backspace':
        batch(() => {
          set_state('i_cursor', state.i_cursor - 1)
          clamp_cursor_to_line()
        })
        break
      case 'j':
        batch(() => {
          set_state('i_line', state.i_line + 1)
          clamp_cursor_to_line()
        })
        break
      case 'k':
        batch(() => {
          set_state('i_line', state.i_line - 1)
          clamp_cursor_to_line()
        })
        break
      case 'a':
        batch(() => {
          set_state('i_cursor', state.i_cursor + 1)
          set_state('mode', 'edit')
        })
        break
      case 'i':
        set_state('mode', 'edit')
        break
      case 'l':
        batch(() => {

          set_state('i_cursor', state.i_cursor + 1)
          clamp_cursor_to_line()
        })
        break
      case 'h':
        batch(() => {
          set_state('i_cursor', state.i_cursor - 1)
          clamp_cursor_to_line()
        })
        break
        default:
          return false
    }
    return true
  }

  const edit_ctrl_mode = (key: string) => {
    switch (key) {
      case 'j':
        edit_break_line()
        break
      default:
        return false
    }
    return true
  }

  const edit_mode = (key: string, is_ctrl_down: boolean) => {
    if (is_ctrl_down) {
      return edit_ctrl_mode(key)
    }
    switch (key) {
      case 'Backspace':
        delete_text_backspace()
        return true
      case 'Escape':
        set_state('mode', 'normal')
        set_state('motion', null)
        break
        default:
          if (key.length > 1) {
            return false
          }
          if (/[a-zA-Z0-9 ]/.test(key)) {
            insert_text(key)
            return true
          }
          return false
    }
    return true
  }



  let $el!: HTMLDivElement
  let focus_on_editor = () => $el.focus()

  onMount(() => {
    focus_on_editor()
  })

  return (<>
  <div ref={$el} tabIndex={1} class='flex flex-col space-mono-regular editor bg-slate-800 w-full h-full text-white cursor-text' onMouseDown={() => focus_on_editor} onKeyDown={handle_key_down}>
    <div class='flex flex-col overflow-hidden w-100'>
    <For each={state.lines}>{ (block, i) => 
       <Block mode={state.mode} block={block} cursor={i() === state.i_line ? state.i_cursor : undefined}/>
    }</For>
    </div>
    <div class='flex-1 bg-slate-800'></div>
    <div class={`flex ${state.mode === 'normal' ? 'bg-amber-500' : 'bg-emerald-500'}`}>
      {state.mode}
    </div>
  </div>
  </>)
}

function Block(props: { block: Line, cursor?: number, mode: Mode }) {

  let chars = createMemo(() => props.block.content.split(''))
  return (<>
    <div>
      <For each={chars()}>{(char, i) =>
        <Char char={char} cursor={i() === props.cursor ? { mode: props.mode } : undefined}></Char>
      }</For>

        <Char char={' '} cursor={chars().length === props.cursor ? { mode: props.mode } : undefined}></Char>
    </div>
  </>)
}

function Char(props: { char: string, cursor?: Cursor }) {
  return (<><span class='relative'>
    <Show when={props.cursor}>{cursor =>
      <Cursor cursor={cursor()} char={props.char} />
    }</Show>
    <span class='relative'>{props.char}</span>
  </span></>)
}

type Cursor = {
  mode: Mode
}
function Cursor(props: { cursor: Cursor, char: string }) {
  return <span class={`left-0 absolute h-full ${props.cursor.mode === 'normal' ? 'w-full bg-amber-500' : 'w-0.5 bg-emerald-500'}`}></span>
}

function Relation(props: { fen: FEN, relation: RelationManager }) {
  let rows = props.relation.get_relation_starting_at_world_id(0).rows.slice(0, 3)

  const row_header = rows[0]
  return (
    <div class=''>
      <div class='bg-amber-500'>{props.relation.name}</div>
      <div class='flex flex-col'>
        <Show when={row_header}>{ row_header =>
          <RowHeader row_header={row_header()}></RowHeader>
        }</Show>
        <For each={rows}>{row => 
          <Row fen={props.fen} row={row}></Row>
        }</For>
      </div>
    </div>
  )
}

type Column = string

function RowHeader(props: { row_header: Map<Column, number> }) {
  let has_move = props.row_header.get('from') !== undefined && props.row_header.get('to') !== undefined
  let keys = [...skip_world_ids(props.row_header).keys()]
  if (has_move) {
    keys.unshift('move')
  }

    return <div class='flex gap-2'>
      <For each={keys}>{(value) =>
        <div class='flex gap-2'>{value}</div>
      }</For>
    </div>
}

type FEN = string
function Row(props: { fen: FEN, row: Map<Column, number> }) {

  let values = createMemo(() => [...value_sensibles(fen_pos(props.fen), skip_world_ids(props.row))])


  return (<>
    <div class='flex gap-2'>
      <For each={values()}>{(value) =>
        <div class='flex gap-2'>{value}</div>
      }</For>
    </div>
  </>)
}

function value_sensibles(pos: Position, m: Map<Column, number>) {
  let res = []

  const square_name = (value: number) => square(value)
  const piece_name = (value: number) => piece(piece_c_to_piece(value))
  const color_name = (value: number) => value === WHITE ? 'White' : 'Black'

  let from, to
  for (let [key, value] of m.entries()) {
    switch (key) {
      case 'from':
      case 'to':
      case 'square':
        if (key === 'from') {
          from = value
        }
        if (key === 'to') {
          to = value
        }
        res.push(square_name(value))
        break
      case 'piece':
        res.push(piece_name(value))
        break
      case 'color':
        res.push(color_name(value))
        break
      default:
        res.push(value)
    }
  }
  if (from !== undefined && to !== undefined) {
    res.unshift(makeSan(pos, { from, to }))
  }
  return res
}

function skip_world_ids(m: Map<Column, number>) {
  let res = new Map()

  for (let key of m.keys()) {
    if (key.includes('world')) {
      continue
    }
    res.set(key, m.get(key))
  }
  return res
}