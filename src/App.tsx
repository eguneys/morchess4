import { createMemo, createSignal, For, onMount, Show } from "solid-js";
import { Chessboard } from "./components/Chessboard";

import wasm_url from './assets/wasm/hopefox.wasm?url'
import { fen_pos, makeSan, piece, piece_c_to_piece, Position, PositionManager, RelationManager, relations, square, WHITE } from 'hopefox'
import { makePersisted } from "@solid-primitives/storage";
import { Editor } from "./components/Editor";

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