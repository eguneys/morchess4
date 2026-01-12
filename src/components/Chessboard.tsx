import { Chessground } from "@lichess-org/chessground"
import { createEffect, onMount } from "solid-js"
import '../assets/chessground/chessground.css'
import '../assets/chessground/cburnett.css'
import '../assets/chessground/theme.css'
import './Chessboard.css'
import type { Api } from "@lichess-org/chessground/api"
import type { Config } from "@lichess-org/chessground/config"
import type { Key } from "@lichess-org/chessground/types"
import { square } from "hopefox"


type FEN = string
type Move = any

export function Chessboard(props: { fen: FEN, last_move?: Move }) {

    let ground: Api

    onMount(() => {

        let config: Config = {
            fen: props.fen
        }
        if (props.last_move) {
            config.lastMove = [square(props.last_move.from) as Key, square(props.last_move.to) as Key]
        }
        ground = Chessground($el, config)
    })

    createEffect(() => {

        let fen = props.fen
        let lastMove
        if (props.last_move) {
            lastMove = [square(props.last_move.from) as Key, square(props.last_move.to) as Key]
        }
        if (!ground) {
            return
        }

        ground.set({ fen, lastMove })
    })

    let $el!: HTMLDivElement

    return (<>
    <div ref={$el} class='is2d chessboard-wrap tinos-bold'></div>
    </>)
}