import { fen_pos, make_move_from_to, makeSan, move_c_to_Move, piece, piece_c_to_piece, Position, PositionManager, RelationManager, relations, square, WHITE, type MoveC } from 'hopefox'
import wasm_url from '../assets/wasm/hopefox.wasm?url'
import { puzzles, type Puzzle } from './fixture'

let m: PositionManager
let pp: Puzzle[]

const init = async () => {

    m = await PositionManager.make(() => wasm_url)
    pp = await puzzles()

    postMessage('ready')
}
init()



type FEN = string

export type RunOnOnePuzzleResult = {
    relations?: RelationView[] 
    error?: string
}

const run_on_one_puzzle = (fen: FEN, program: string): RunOnOnePuzzleResult => {
    let pos = m.create_position(fen)
    let res, error
    try {
        let res2 = relations(m, pos, program)
        res = [...res2.values()]
    } catch (e) {
        if (e instanceof Error) {
            error = e.message
        }
    }
    m.delete_position(pos)
    return { relations: res?.map(_ => convert_manager_to_view(fen_pos(fen), _)), error }
}


let skips500 = [
    501, 502, 504, 506, 507, 508, 509, 510, 512,
    513, 514, 516, 517, 519, 521, 522, 524, 528,
    529, 534, 535, 537, 538, 539, 540, 541, 542,
    544, 546, 547, 549, 554, 555, 556, 557, 558,
    559, 560, 561, 562, 565, 568, 570, 571, 573,
    574, 575, 576, 577, 578, 580, 581, 583, 584,
    585, 587, 588, 590, 591, 593, 594, 595, 596,
    597, 598, 599
]

let skips0 = [
  28, 34, 39, 47, 48, 54, 56,      
  62, 65, 66, 67, 69, 70, 72,      
  75, 79, 80, 83, 84, 87, 92,      
  94
]

let skips = skips500
skips = skips0

export type PuzzleResult = {
    puzzle: Puzzle,
    result: RunOnOnePuzzleResult
}

type Program = string

let active_step_timeout: number

const run_on_skips = (program: Program) => {
    let res: PuzzleResult[] = []

    clearTimeout(active_step_timeout)

    function step(i: number) {
        let startTime = performance.now()
        for (; i < skips.length; i++) {
            let puzzle = pp[i]
            res.push({
                puzzle,
                result: run_on_one_puzzle(puzzle.move_fens[0], program)
            })

            postMessage({ t: 'progress', d: `${i + 1} ${skips.length}` })

            if (performance.now() - startTime > 16) {
                active_step_timeout = setTimeout(() => step(i + 1))
                return
            }
        }

        postMessage({ t: 'run_on_skips', d: res })
    }

    step(0)
}

onmessage = async (e: MessageEvent) => {
    if (e.data.t === 'list') {
        postMessage({ t: 'list', d: skips.map(_ => pp[_]) })
    }
    if (e.data.t === 'one') {
        let puzzle = pp.find(_ => _.id === e.data.d.id)!
        let program = e.data.d.program
        let result = run_on_one_puzzle(puzzle.move_fens[e.data.d.cursor], program)
        postMessage({ t: 'run_on_one', 
            d: {
                puzzle,
                result
            }
        })
    }
    if (e.data.t === 'batch') {
        let program = e.data.d.program
        run_on_skips(program)
    }
}


// postMessage({ t: 'progress', d })


function convert_manager_to_view(pos: Position, r: RelationManager): RelationView {

    let rows = r.get_relation_starting_at_world_id(0).rows.map(row => {
        return value_sensibles(pos, row)
    })

    return { name: r.name, rows }
}

export type RowView = Record<Column, string>
export type RelationView = {
    name: Column
    rows: RowView[]
}


type Column = string
function value_sensibles(pos: Position, m: Map<Column, number>) {
  let res: any = {}

  const square_name = (value: number) => square(value)
  const piece_name = (value: number) => piece(piece_c_to_piece(value))
  const color_name = (value: number) => value === WHITE ? 'White' : 'Black'

  let aa = extract_line(m)

  let resaa = extract_sans(pos, aa)
  if (resaa.length > 0) {
    res['line'] = resaa.join(' ')
  }

  for (let [key, value] of m.entries()) {
    switch (key) {
      case 'from':
      case 'to':
      case 'to2':
      case 'square':
      case 'block':
        res[key] = square_name(value)
        break
      case 'piece':
        res[key] = piece_name(value)
        break
      case 'color':
        res[key] = color_name(value)
        break
      default:
        if (key.includes('to')) {
          res[key] = square(value)
        } else if (key.includes('piece')) {
          res[key] = piece_name(value)
        } else {
          if (key.includes('world')) {
            continue
          }
          res[key] = value
        }
    }
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