import { createSignal, onMount } from "solid-js";
import { Chessboard } from "./components/Chessboard";

import wasm_url from './assets/wasm/hopefox.wasm?url'
import { flat_san_moves_c, PositionManager, search } from 'hopefox'
import { makePersisted } from "@solid-primitives/storage";

let m = await PositionManager.make(() => wasm_url)

export default function App() {

  let [program, set_program] = makePersisted(createSignal(''), {
    name: 'program'
  })

  let [output, set_output] = createSignal('')

  let fen = () => 'r2q1rk1/p1p1bppp/2pp2b1/4p3/4n1PN/2NP3P/PPP2PK1/R1BQ1R2 w - - 0 12'

  const on_program_changed = (rules: string) => {

    set_program(rules)

    try {
      let column = 'x'
      let pos = m.create_position(fen())
      let res = search(m, pos, program(), [column])

      let out_moves = dedup_sans(flat_san_moves_c(m, pos, res.get(column)!))
      set_output(out_moves.join('\n'))
    } catch (e) {

      console.error(e)
    }
  }

  onMount(() => {
    on_program_changed(program())
  })

  const on_editor_key_press = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      on_program_changed((e.target as HTMLTextAreaElement).value)
    }
  }

  return (<>
    <h1 class='text-3xl inter-500'>Mor Chess 4</h1>

    <div class='flex p-2 gap-2'>
      <div class='flex-2'>
        <div class='flex flex-col'>
        <label class='self-center'>Program</label>
        <textarea onKeyPress={on_editor_key_press} class='bg-slate-900 text-white h-100' placeholder='Program here..' value={program()} onChange={_ => on_program_changed(_.target.value)}></textarea>
        </div>
      </div>
      <div class='flex-2'>
        <div>
          {output()}
        </div>
      </div>
      <div class='flex-2'>
        <Chessboard fen={fen()}/>
      </div>
    </div>
  </>)
}

type SAN = string
function dedup_sans(m: SAN[][]) {
    return [...new Set(m.map(_ => _.join(' ')))].map(_ => _.split(" "))
}