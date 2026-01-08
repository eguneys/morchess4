import { Chessground } from "@lichess-org/chessground"
import { createEffect, onMount } from "solid-js"
import '../assets/chessground/chessground.css'
import '../assets/chessground/cburnett.css'
import '../assets/chessground/theme.css'
import './Chessboard.css'
import type { Api } from "@lichess-org/chessground/api"


type FEN = string
export function Chessboard(props: { fen: FEN }) {

    let ground: Api

    onMount(() => {

        let config = {
            fen: props.fen
        }
        ground = Chessground($el, config)
    })

    createEffect(() => {

        let fen = props.fen
        if (!ground) {
            return
        }
        ground.set({ fen })
    })

    let $el!: HTMLDivElement

    return (<>
    <div ref={$el} class='is2d chessboard-wrap tinos-bold'></div>
    </>)
}