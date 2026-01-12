import { createMemo, createSignal, For, Show, Suspense } from "solid-js";
import { Chessboard } from "./components/Chessboard";

import wasm_url from './assets/wasm/hopefox.wasm?url'
import { fen_pos, make_move_from_to, makeSan, move_c_to_Move, parseUci, piece, piece_c_to_piece, Position, PositionManager, RelationManager, relations, square, WHITE, type MoveC } from 'hopefox'
import { Editor } from "./components/Editor";
import { puzzles, type Puzzle } from "./worker/fixture";
import { createAsync, Route, Router } from "@solidjs/router";

let m = await PositionManager.make(() => wasm_url)

type PuzzlesState = {
  puzzles: Puzzle[] | undefined
  skips: number[]
}
function createPuzzles(): PuzzlesState {

  let skips = [
    501, 502, 504, 506, 507, 508, 509, 510, 512,
    513, 514, 516, 517, 519, 521, 522, 524, 528,
    529, 534, 535, 537, 538, 539, 540, 541, 542,
    544, 546, 547, 549, 554, 555, 556, 557, 558,
    559, 560, 561, 562, 565, 568, 570, 571, 573,
    574, 575, 576, 577, 578, 580, 581, 583, 584,
    585, 587, 588, 590, 591, 593, 594, 595, 596,
    597, 598, 599
  ]

  let pp = createAsync(puzzles)


  return {
    get puzzles() {
      return pp()
    },
    get skips() {
      return skips
    }
  }


}


export default function App() {

  return (<>
    <Router>
      <Route path='/' component={Home} />
    </Router>
  </>)
}
function Home() {

  let puzzles = createPuzzles()

  return (<>
    <Suspense fallback={"Loading puzzles"}>
      <Show when={puzzles.puzzles}>
        <WithPuzzles puzzles={puzzles}/>
      </Show>
    </Suspense>
  </>)
}

function WithPuzzles(props: { puzzles: PuzzlesState }) {

  let [get_relations, set_relations] = createSignal<RelationManager[]>([], { equals: false })

  let [i_puzzle, set_i_puzzle] = createSignal(props.puzzles.puzzles![props.puzzles.skips[0]].id)
  let puzzle = () => props.puzzles.puzzles!.find(_ => _.id === i_puzzle())!
  let fen = createMemo(() => puzzle().move_fens[0])
  let solution = createMemo(() => puzzle().sans.join(' '))
  let last_move = createMemo(() => parseUci(puzzle().moves.split(' ')[0]))

  let solution2 = createMemo(() => {
    let res = get_relations().find(_ => _.name === 'solution')
    if (!res) {
      return '--'
    }
    let row = res.get_relation_starting_at_world_id(0).rows[0]
    if (!row) {
      return '--'
    }
    return extract_sans(fen_pos(fen()), extract_line(row)).join(' ')
  })

  const [program, set_program] = createSignal('')

  const on_program_changed = (rules: string) => {
    set_program(rules)
    run_on_one_puzzle()
  }

  const on_puzzle_selected = (puzzle: Puzzle) => {
    set_i_puzzle(puzzle.id)
    run_on_one_puzzle()
  }



  const run_on_one_puzzle = () => {
    try {
      let pos = m.create_position(fen())
      let res = relations(m, pos, program())
      set_relations([...res.values()])

      on_set_column_under_cursor(column_under_cursor)
      set_editor_error(undefined)
    } catch (e) {
      if (e instanceof Error) {
        set_editor_error(e.message)
      }
    }
  }

  const [editor_error, set_editor_error] = createSignal<string | undefined>(undefined)

  let column_under_cursor: Column = ''
  const on_set_column_under_cursor = (column: Column) => {
    set_relations(get_relations().sort((a, _) => a.name === column ? -1 : 0))
    column_under_cursor = column
  }


  return (<>
    <div class='flex p-2 h-130'>
      <div class='flex-2'>
        <div class='flex flex-col'>
          <div class='h-150'>
          <Editor on_save_program={on_program_changed} on_set_column_under_cursor={on_set_column_under_cursor} />
          </div>
          <Show when={editor_error()}>
          <div class='px-2 py-1 bg-red-500 text-white'>{editor_error()}</div>
          </Show>
        </div>
      </div>
      <div class='flex-2 min-h-0 overflow-y-auto'>
        <For each={get_relations()}>{relation =>
          <Relation fen={fen()} relation={relation}></Relation>
        }</For>
      </div>
      <div class='flex-2'>
        <div>
          <div>
            <PuzzleList selected={i_puzzle()} on_select_puzzle={on_puzzle_selected} puzzles={props.puzzles}/>
          </div>
          <div>
            <Chessboard fen={fen()} last_move={last_move()}/>
            <div>{solution()}</div>
            <div>{solution2()}</div>
          </div>
        </div>
      </div>
    </div>
  </>)
}

function PuzzleList(props: { selected: string, puzzles: PuzzlesState, on_select_puzzle: (p: Puzzle) => void }) {

  return (<>
  <div class='flex flex-col overflow-y-scroll max-h-30'>
    <For each={props.puzzles.skips}>{i => 
        <div>
          <PuzzleItem selected={props.selected === props.puzzles.puzzles![i].id} puzzle={props.puzzles.puzzles![i]} on_click={() => props.on_select_puzzle(props.puzzles.puzzles![i])} />
        </div>
    }</For>
  </div>
  </>)
}

function PuzzleItem(props: { selected: boolean, puzzle: Puzzle, on_click: () => void }) {
  return (<>
    <div onClick={props.on_click} class={`flex items-center px-1 py-1 ${props.selected ? 'bg-amber-200' : 'bg-slate-400'} hover:bg-gray-200 cursor-pointer`}>
      <div><a class='text-blue-800' href={props.puzzle.link} target="_blank">{props.puzzle.id}</a></div>
      <div class='flex-1'></div>
      <div class='text-xs'>{props.puzzle.tags}</div>
    </div>
  </>)
}

function Relation(props: { fen: FEN, relation: RelationManager }) {
  let rows = props.relation.get_relation_starting_at_world_id(0).rows

  const row_header = rows[0]
  return (
    <div class='relative overflow-x-auto'>
      <div class='px-1 py-1 bg-amber-800 text-white tracking-wide'>{props.relation.name}: {rows.length} rows</div>
      <div class='overflow-y-auto max-h-40'>
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

  for (let [key, value] of m.entries()) {
    switch (key) {
      case 'from':
      case 'to':
      case 'to2':
      case 'square':
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

  let resaa = extract_sans(pos, aa)
  if (resaa.length > 0) {
    res.unshift(resaa.join(' '))
  }
  return res
}

function extract_sans(pos: Position, aa: MoveC[]) {

  let resaa = []
  let p2 = pos.clone()
  for (let a = 0; a < aa.length; a++) {
    let move = move_c_to_Move(aa[a])
    resaa.push(makeSan(p2, move))
    p2.play(move)
  }
  return resaa
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