import { createMemo, createSignal, For, onMount, Show } from "solid-js";
import { Chessboard } from "./components/Chessboard";

import wasm_url from './assets/wasm/hopefox.wasm?url'
import { fen_pos, make_move_from_to, makeSan, move_c_to_Move, piece, piece_c_to_piece, Position, PositionManager, RelationManager, relations, square, WHITE } from 'hopefox'
import { makePersisted } from "@solid-primitives/storage";
import { Editor } from "./components/Editor";

let m = await PositionManager.make(() => wasm_url)

export default function App() {

  let [program, set_program] = makePersisted(createSignal(''), {
    name: 'program'
  })

  let [get_relations, set_relations] = createSignal<RelationManager[]>([], { equals: false })

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

  const on_set_column_under_cursor = (column: Column) => {
    set_relations(get_relations().sort((a, _) => a.name === column ? -1 : 0))
  }

  onMount(() => {
    //console.log(program())
    on_program_changed(program())
  })

  return (<>
    <h1 class='text-3xl inter-500'>Mor Chess 4</h1>

    <div class='flex p-2 gap-2 h-130'>
      <div class='flex-2'>
        <Editor on_save_program={on_program_changed} on_set_column_under_cursor={on_set_column_under_cursor}/>
      </div>
      <div class='flex-2 min-h-0 overflow-y-auto'>
        <For each={get_relations()}>{relation =>
          <Relation fen={fen()} relation={relation}></Relation>
        }</For>
      </div>
      <div class='flex-2'>
        <Chessboard fen={fen()}/>
      </div>
    </div>
  </>)
}

function Relation(props: { fen: FEN, relation: RelationManager }) {
  let rows = props.relation.get_relation_starting_at_world_id(0).rows.slice(0, 8)

  const row_header = rows[0]
  return (
    <div class='relative overflow-x-auto'>
      <div class='px-1 py-1 bg-amber-800 text-white tracking-wide'>{props.relation.name}</div>
      <div class='overflow-y-auto max-h-30'>
        <table class='min-w-full divide-y divide-gray-200'>
          <thead class='bg-gray-50'>
          <Show when={row_header}>{row_header =>
            <RowHeader row_header={row_header()}></RowHeader>
          }</Show>
          </thead>
          <tbody class='bg-white divide-y divide-gray-200'>
          <For each={rows}>{row =>
            <Row fen={props.fen} row={row}></Row>
          }</For>
          </tbody>
        </table>
      </div>
    </div>
  )
}

type Column = string

function RowHeader(props: { row_header: Map<Column, number> }) {
  let has_move = props.row_header.get('from') !== undefined && props.row_header.get('to') !== undefined
  let keys = [...skip_world_ids(props.row_header).keys()]
  if (has_move) {
    keys.unshift('line')
  }

    return <tr class='overflow-y-scroll'>
      <For each={keys}>{(value) =>
        <th scope='col' class='px-6 py-2 text-left text-xs font-meidum text-gray-500 tracking-wider'>.{value}</th>
      }</For>
    </tr>
}

type FEN = string
function Row(props: { fen: FEN, row: Map<Column, number> }) {

  let values = createMemo(() => [...value_sensibles(fen_pos(props.fen), skip_world_ids(props.row))])


  return (<>
    <tr>
      <For each={values()}>{(value) =>
        <td class='px-6 py-0 whitespace-nowrap'>{value}</td>
      }</For>
    </tr>
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
  let aa = extract_line(m)

  let resaa = []
  let p2 = pos.clone()
  for (let a = 0; a < aa.length; a++) {
    let move = move_c_to_Move(aa[a])
    resaa.push(makeSan(p2, move))
    p2.play(move)
  }
  res.unshift(resaa.join(' '))
  return res
}

type Row = Map<Column, number>
function extract_line(row: Row) {
  let res = []
  for (let i = 1; i < 8; i++) {
    let key = i == 1 ? '' : i
    if (!row.has('from' + key)) {
      break
    }
    res.push(make_move_from_to(row.get('from' + key)!, row.get('to' + key)!))
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