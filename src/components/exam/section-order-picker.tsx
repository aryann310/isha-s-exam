"use client";

import { useState } from "react";

/** Lets the candidate pick a section order (NMAT style). Submits it as repeated `sectionOrder` fields. */
export function SectionOrderPicker({ orders }: { orders: string[][] }) {
  const [choice, setChoice] = useState(0);
  return (
    <fieldset className="border border-gray-300 rounded p-4">
      <legend className="px-2 font-bold">Choose your section order</legend>
      <p className="text-xs text-gray-600 mb-3">This cannot be changed once the test begins.</p>
      <div className="space-y-2">
        {orders.map((order, i) => (
          <label key={order.join("|")} className="flex items-start gap-2 cursor-pointer">
            <input type="radio" name="sectionOrderChoice" checked={choice === i} onChange={() => setChoice(i)} className="mt-1" />
            <span>{order.map((n, j) => `${j + 1}. ${n}`).join("   →   ")}</span>
          </label>
        ))}
      </div>
      {orders[choice]?.map((name, j) => <input key={j} type="hidden" name="sectionOrder" value={name} />)}
    </fieldset>
  );
}
