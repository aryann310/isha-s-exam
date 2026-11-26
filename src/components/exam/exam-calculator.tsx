"use client";

import { useState } from "react";

type Op = "+" | "-" | "×" | "÷" | null;

function format(n: number): string {
  if (!Number.isFinite(n)) return "Error";
  const s = String(Math.round(n * 1e10) / 1e10);
  return s.length > 16 ? n.toExponential(8) : s;
}

function apply(a: number, b: number, op: Op): number {
  switch (op) {
    case "+": return a + b;
    case "-": return a - b;
    case "×": return a * b;
    case "÷": return b === 0 ? NaN : a / b;
    default: return b;
  }
}

/** Basic on-screen calculator (as provided in CAT): + − × ÷, %, √, 1/x, ±, and memory keys. */
export function ExamCalculator({ onClose }: { onClose: () => void }) {
  const [display, setDisplay] = useState("0");
  const [acc, setAcc] = useState<number | null>(null);
  const [op, setOp] = useState<Op>(null);
  const [fresh, setFresh] = useState(true);
  const [memory, setMemory] = useState(0);
  const [expr, setExpr] = useState("");

  const value = () => Number(display);
  const show = (n: number) => {
    setDisplay(format(n));
    setFresh(true);
  };

  const digit = (d: string) => {
    if (display === "Error") {
      setDisplay(d === "." ? "0." : d);
      setFresh(false);
      return;
    }
    if (fresh) {
      setDisplay(d === "." ? "0." : d);
      setFresh(false);
    } else if (d === "." && display.includes(".")) {
      return;
    } else if (display.replace(/[-.]/g, "").length < 16) {
      setDisplay(display === "0" && d !== "." ? d : display + d);
    }
  };

  const operator = (next: Op) => {
    const v = value();
    if (acc !== null && op && !fresh) {
      const r = apply(acc, v, op);
      setAcc(r);
      show(r);
      setExpr(`${format(r)} ${next}`);
    } else {
      setAcc(v);
      setFresh(true);
      setExpr(`${format(v)} ${next}`);
    }
    setOp(next);
  };

  const equals = () => {
    if (op === null || acc === null) return;
    const r = apply(acc, value(), op);
    setExpr("");
    setAcc(null);
    setOp(null);
    show(r);
  };

  const unary = (fn: (n: number) => number) => show(fn(value()));
  const clearAll = () => {
    setDisplay("0");
    setAcc(null);
    setOp(null);
    setExpr("");
    setFresh(true);
  };

  const key = "h-9 rounded border border-gray-300 bg-gradient-to-b from-white to-gray-100 hover:from-gray-50 hover:to-gray-200 text-sm font-semibold text-gray-800 active:translate-y-px";
  const keys: Array<[string, () => void, string?]> = [
    ["MC", () => setMemory(0)],
    ["MR", () => show(memory)],
    ["MS", () => setMemory(value())],
    ["M+", () => setMemory(memory + value())],
    ["M−", () => setMemory(memory - value())],
    ["←", () => !fresh && setDisplay(display.length > 1 ? display.slice(0, -1) : "0")],
    ["CE", () => { setDisplay("0"); setFresh(true); }],
    ["C", clearAll],
    ["±", () => setDisplay(display.startsWith("-") ? display.slice(1) : display === "0" ? "0" : "-" + display)],
    ["√", () => unary((n) => (n < 0 ? NaN : Math.sqrt(n)))],
    ["7", () => digit("7")], ["8", () => digit("8")], ["9", () => digit("9")],
    ["÷", () => operator("÷"), "op"],
    ["%", () => unary((n) => (acc !== null ? (acc * n) / 100 : n / 100))],
    ["4", () => digit("4")], ["5", () => digit("5")], ["6", () => digit("6")],
    ["×", () => operator("×"), "op"],
    ["1/x", () => unary((n) => (n === 0 ? NaN : 1 / n))],
    ["1", () => digit("1")], ["2", () => digit("2")], ["3", () => digit("3")],
    ["−", () => operator("-"), "op"],
    ["=", equals, "eq"],
    ["0", () => digit("0"), "zero"], [".", () => digit(".")],
    ["+", () => operator("+"), "op"],
  ];

  return (
    <div className="fixed z-50 top-28 right-4 md:right-[22rem] w-72 bg-gray-200 border border-gray-400 rounded shadow-2xl select-none">
      <div className="flex justify-between items-center bg-exam-dark text-white px-3 py-1.5 rounded-t">
        <span className="text-xs font-bold">Calculator</span>
        <button onClick={onClose} className="text-white/90 hover:text-white text-sm font-bold" aria-label="Close calculator">
          ✕
        </button>
      </div>
      <div className="p-2 space-y-2">
        <div className="bg-white border border-gray-400 rounded px-2 py-1 text-right font-mono">
          <div className="text-[11px] text-gray-500 h-4 flex justify-between">
            <span>{memory !== 0 ? "M" : ""}</span>
            <span>{expr}</span>
          </div>
          <div className="text-xl text-gray-900 truncate">{display}</div>
        </div>
        <div className="grid grid-cols-5 gap-1">
          {keys.map(([label, fn, kind]) => (
            <button
              key={label}
              type="button"
              onClick={fn}
              className={`${key} ${kind === "op" ? "text-exam-dark" : ""} ${kind === "eq" ? "row-span-2 h-auto bg-none bg-exam-dark text-white hover:opacity-90" : ""} ${
                kind === "zero" ? "col-span-2" : ""
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
