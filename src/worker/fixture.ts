import { Chess, makeFen, makeSan, parseFen, parseUci } from "hopefox"

export const a_hundred = async () => parse_puzzles(await fetch('data/a_hundred_puzzles.csv').then(_ => _.text()))

export const puzzles = async () => parse_puzzles(await fetch('data/athousand_sorted.csv').then(_ => _.text()))

export const tenk = async () => parse_puzzles(await fetch('data/tenk_puzzle.csv').then(_ => _.text()))

function parse_puzzles(str: string): Puzzle[] {
    return str.trim().split('\n').map(_ => {

        let [id, fen, moves, _a, _b, _c, _d, tags] = _.split(',')

        let sans: string[] = []


        let link = `https://lichess.org/training/${id}`

        let initial = true

        return {
            id, link, fen, moves, tags, 
            get move_fens() {
                let move_fens: string[] = []

                let pos = Chess.fromSetup(parseFen(fen).unwrap()).unwrap()
                moves.split(' ').forEach((uci, i) => {
                    let move = parseUci(uci)!
                    if (initial)
                        if (i > 0) sans.push(makeSan(pos, move))
                    pos.play(move)

                    move_fens.push(makeFen(pos.toSetup()))
                })

                initial = false
                return move_fens

            }, sans
        }
    })
}

export type Puzzle = {
    id: string,
    link: string,
    fen: string,
    moves: string,
    sans: string[],
    move_fens: string[],
    tags: string
}