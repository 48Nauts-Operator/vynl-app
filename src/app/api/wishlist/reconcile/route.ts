import { NextResponse } from "next/server";
import { reconcileWishlist } from "@/lib/wishlist-reconciler";

export async function POST() {
  try {
    const result = reconcileWishlist();
    return NextResponse.json(result);
  } catch (err) {
    console.error("Wishlist reconciliation error:", err);
    return NextResponse.json(
      { error: "Reconciliation failed", details: String(err) },
      { status: 500 }
    );
  }
}
