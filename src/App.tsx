import { batch, createEffect, createMemo, createSignal, For, type JSX, onCleanup, Show } from "solid-js";
import { Chessboard } from "./components/Chessboard";
import { parseUci } from 'hopefox'
import { Editor } from "./components/Editor";
import { type Puzzle } from "./worker/fixture";
import { HashRouter, Route } from "@solidjs/router";
import { useWorker, WorkerProvider } from './worker/Worker2'
import { createStore } from "solid-js/store";
import type { PuzzleResult, RelationView, RowView } from "./worker/worker_job";
import { makePersisted } from "@solid-primitives/storage";

export default function App() {

  return (<>
    <HashRouter root={Layout}>
      <Route path='/' component={Home} />
    </HashRouter>
  </>)
}


function Layout(props: { children?: JSX.Element }) {
  return (<>
    {props.children}
  </>)
}

function Home() {
  return (<>
    <WorkerProvider>
      <WithWorker />
    </WorkerProvider>
  </>)
}

type PuzzleId = string

type State = {
  program: string
  selected_puzzle: SelectedPuzzleInfo | undefined
  run_on_one: PuzzleResult | undefined
}

type Move = any
type SelectedPuzzleInfo = {
  id: PuzzleId
  fen: FEN
  i_cursor: number
  puzzle: Puzzle
  last_move: Move
  solution: string
}

type PersistedState = {
  selected_puzzle: SelectedPuzzleInfo | undefined
}

function WithWorker() {

  const [worker, { one }] = useWorker()

  const [state, set_state] = createStore<State>({
    program: '',
    selected_puzzle: undefined,
    get run_on_one() {
      return worker.run_on_one
    }
  })

  const [persisted_state, set_persisted_state] = makePersisted(createStore<PersistedState>({
    selected_puzzle: undefined
  }), {
    name: '.morchess4.app-state.v1'
  })

  function load_state() {
    set_state('selected_puzzle', persisted_state.selected_puzzle)
  }
  function save_state() {
    set_persisted_state('selected_puzzle', state.selected_puzzle)
  }

  const solution = createMemo(() => {
    return state.run_on_one?.result.relations?.find(_ => _.name === 'solution')?.rows[0]?.line ?? '--'
  })

  const run_on_one_puzzle = () => {
    if (state.selected_puzzle === undefined) {
      return
    }
    one(state.selected_puzzle.id, state.program, state.selected_puzzle.i_cursor)
  }



  const selected_puzzle = createMemo(() => {
    if (worker.list !== undefined) {
      load_state()
      if (state.selected_puzzle === undefined || !worker.list.find(_ => _.id === state.selected_puzzle!.id)) {
        let puzzle = worker.list[0]
        set_state('selected_puzzle', {
          id: puzzle.id,
          puzzle: puzzle,
          i_cursor: 0,
          fen: puzzle.move_fens[0],
          last_move: parseUci(puzzle.moves.split(' ')[0]),
          solution: puzzle.sans.join(' ')
        })
        save_state()
      }
      run_on_one_puzzle()
    }
    return worker.list?.find(_ => _.id === state.selected_puzzle?.id)
  })

  const on_program_changed = (rules: string) => {
    set_state('program', rules)
    run_on_one_puzzle()
  }

  const on_puzzle_selected = (puzzle: Puzzle) => {
    set_state('selected_puzzle', {
      id: puzzle.id,
      puzzle: puzzle,
      i_cursor: 0,
      fen: puzzle.move_fens[0],
      last_move: parseUci(puzzle.moves.split(' ')[0]),
      solution: puzzle.sans.join(' ')
    })
    save_state()
    run_on_one_puzzle()
  }

  const relation_slice = createMemo(() => {
    return state.run_on_one?.result.relations?.slice(0)
  })


  const [column_under_cursor, set_column_under_cursor] = createSignal(undefined)

  const sorted_relations = () => {
    let column = column_under_cursor()
    return relation_slice()?.sort((a, _) => a.name === column ? -1 : 0)
  }

  const go_prev = () => {
    if (state.selected_puzzle === undefined) {
      return
    }
    let prev_cursor = state.selected_puzzle.i_cursor - 1
    let prev_fen = state.selected_puzzle.puzzle.move_fens[prev_cursor]
    if (prev_fen) {
      batch(() => {
        set_state('selected_puzzle', 'i_cursor', prev_cursor)
        set_state('selected_puzzle', 'fen', prev_fen)
      })
      save_state()
      run_on_one_puzzle()
    }
  }
  const go_next = () => {
    if (state.selected_puzzle === undefined) {
      return
    }
    let next_cursor = state.selected_puzzle.i_cursor + 1
    let next_fen = state.selected_puzzle.puzzle.move_fens[next_cursor]
    if (next_fen) {
      batch(() => {
        set_state('selected_puzzle', 'i_cursor', next_cursor)
        set_state('selected_puzzle', 'fen', next_fen)
      })
      save_state()
      run_on_one_puzzle()
    }
  }

  const on_board_wheel = (delta: number) => {
    if (delta < 0) {
      go_prev()
    } else {
      go_next()
    }
  }

  const on_keydown = (e: KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowRight':
        go_next()
        break
      case 'ArrowLeft':
        go_prev()
        break
      case 'ArrowDown':
        next_puzzle()
        break
      case 'ArrowUp':
        prev_puzzle()
        break
      default:
        return
    }
    e.preventDefault()
  }

  document.addEventListener('keydown', on_keydown)
  onCleanup(() => {
    document.removeEventListener('keydown', on_keydown)
  })

  const next_puzzle = () => {
    if (worker.list === undefined) {
      return
    }
    let i = worker.list.findIndex(_ => _.id === selected_puzzle()?.id)
    if (i > -1) {
      on_puzzle_selected(worker.list[(i + 1 + worker.list.length) % worker.list.length])
    }
  }

  const prev_puzzle = () => {
    if (worker.list === undefined) {
      return
    }
    let i = worker.list.findIndex(_ => _.id === selected_puzzle()?.id)
    if (i > -1) {
      on_puzzle_selected(worker.list[(i - 1 + worker.list.length) % worker.list.length])
    }
  }

  const on_command_execute = (command: string) => {
    switch (command) {
      case 'next':
        next_puzzle()
        break
      case 'prev':
        prev_puzzle()
        break
      case 'copy':
        navigator.clipboard.writeText(state.program)
        break
      default:
        return false
    }
    return true
  }

  return (<>
    <div class='flex h-screen bg-stone-200 px-1'>
      <div class='flex-2'>
        <div class='flex flex-col'>
          <div class='h-150'>
          <Editor on_command_execute={on_command_execute} on_save_program={on_program_changed} on_set_column_under_cursor={set_column_under_cursor} />
          </div>
          <Show when={state.run_on_one?.result.error}>{ error =>
            <div class='px-2 py-1 bg-red-500 text-white'>{error()}</div>
          }</Show>
        </div>
      </div>
      <div class='flex-2 min-h-0 overflow-y-auto'>
        <For each={sorted_relations()}>{relation =>
          <Relation relation={relation}></Relation>
        }</For>
      </div>
      <div class='flex-2'>
        <div>
          <div>
            <Show when={selected_puzzle()?.id}>{ id =>
              <PuzzleList selected={id()} on_select_puzzle={on_puzzle_selected} />
            }</Show>
          </div>
          <div>
            <Show when={state.selected_puzzle}>{p =>
              <>
                <Chessboard on_wheel={on_board_wheel} fen={p().fen} last_move={p().last_move} />
                <div class='bg-amber-400 p-2'>{p().solution}</div>
                <div class='bg-emerald-400 p-2'>{solution()}</div>
              </>
            }</Show>
          </div>
        </div>
      </div>
    </div>
  </>)
}

function PuzzleList(props: { selected: PuzzleId, on_select_puzzle: (p: Puzzle) => void }) {

  let [state] = useWorker()

  return (<>
  <div class='flex flex-col overflow-y-scroll max-h-30'>
    <For each={state.list}>{ (p, i) => 
        <PuzzleItem n={i() + 1} selected={props.selected === p.id} puzzle={p} on_click={() => props.on_select_puzzle(p)} />
    }</For>
  </div>
  </>)
}

function PuzzleItem(props: { n: number, selected: boolean, puzzle: Puzzle, on_click: () => void }) {

  createEffect(() => {
    if (props.selected) {
      $el.scrollIntoView({block: 'nearest'})
    }
  })

  let $el!: HTMLDivElement

  return (<>
    <div ref={$el} onClick={props.on_click} class={`flex items-center px-1 py-1 ${props.selected ? 'bg-amber-200' : 'bg-slate-400'} hover:bg-gray-200 cursor-pointer`}>
      <div class='text-sm font-bold ml-0.5 mr-2'>{props.n}.</div>
      <div><a class='text-blue-800' href={props.puzzle.link} target="_blank">{props.puzzle.id}</a></div>
      <div class='flex-2'></div>
      <div class='text-xs flex-1'>{props.puzzle.tags}</div>
    </div>
  </>)
}

function Relation(props: { relation: RelationView }) {
  let rows = createMemo(() => props.relation.rows.slice(0, 100))

  const row_header = createMemo(() => rows()[0])
  return (
    <div class='relative overflow-x-auto'>
      <div class='px-1 py-1 bg-amber-800 text-white tracking-wide'>{props.relation.name}: {props.relation.rows.length} rows</div>
      <div class='overflow-y-auto max-h-40'>
        <table class='min-w-full divide-y divide-gray-200'>
          <thead class='bg-gray-50'>
          <Show when={row_header()}>{row_header =>
            <RowHeader row_header={row_header()}></RowHeader>
          }</Show>
          </thead>
          <tbody class='bg-white divide-y divide-gray-200'>
          <For each={rows()}>{row =>
            <Row row={row}></Row>
          }</For>
          </tbody>
        </table>
      </div>
    </div>
  )
}

function RowHeader(props: { row_header: RowView }) {
  let keys = [...Object.keys(props.row_header)]
  return <tr class='overflow-y-scroll'>
    <For each={keys}>{(value) =>
      <th scope='col' class='px-6 py-2 text-left text-xs font-meidum text-gray-500 tracking-wider'>.{value}</th>
    }</For>
  </tr>
}

type FEN = string
function Row(props: { row: RowView }) {

  let values = createMemo(() => Object.values(props.row))

  return (<>
    <tr>
      <For each={values()}>{(value) =>
        <td class='px-6 py-0 whitespace-nowrap'>{value}</td>
      }</For>
    </tr>
  </>)
}
