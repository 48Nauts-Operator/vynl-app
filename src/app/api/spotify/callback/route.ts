import { NextRequest, NextResponse } from "next/server";
import { exchangeCode, storeTokens, fetchUserProfile } from "@/lib/spotify";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");

  // Redirect to the LAN host (not localhost) so the user stays on the right address
  const vynlHost = process.env.NEXT_PUBLIC_VYNL_HOST || request.nextUrl.origin;

  if (error) {
    return NextResponse.redirect(`${vynlHost}/settings?spotify=error&reason=${error}`);
  }

  if (!code) {
    return NextResponse.redirect(`${vynlHost}/settings?spotify=error&reason=no_code`);
  }

  try {
    const tokens = await exchangeCode(code);

    // Temporarily store tokens so fetchUserProfile can use them
    await storeTokens({
      ...tokens,
      spotifyUserId: "pending",
    });

    // Fetch user profile to get user ID and display name
    const profile = await fetchUserProfile();

    // Update with actual user info
    await storeTokens({
      ...tokens,
      spotifyUserId: profile.id,
      spotifyDisplayName: profile.display_name,
    });

    return NextResponse.redirect(`${vynlHost}/settings?spotify=connected`);
  } catch (err) {
    console.error("Spotify callback error:", err);
    return NextResponse.redirect(
      `${vynlHost}/settings?spotify=error&reason=token_exchange_failed`
    );
  }
}
