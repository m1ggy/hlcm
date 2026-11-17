// Passwords we make up for people who won't set their own: a client
// company's caregivers and a new workspace's owner (docs/client-care-plan.md).
// Three short everyday words and a number — easy to read out over the phone
// or copy off a sticky note, e.g. "maple-river-candle-42";
// sign-in throttling (src/lib/login-throttle.ts) caps guessing far below
// what that would take. (192 words: about 29 bits.)
//
// Uses Web Crypto, so it runs on the server and in the browser (the edit-user
// dialog's Generate button). Shown once to whoever made it; only the hash is
// stored, and it's never logged, emailed or written to the audit log.

const WORDS = [
  "acorn", "amber", "anchor", "apple", "arrow", "aspen", "autumn", "badge", "bagel", "bamboo", "banjo", "basil", "beach", "beacon", "berry", "birch",
  "biscuit", "blossom", "bluebird", "boat", "bonnet", "brook", "bubble", "bucket", "butter", "cabin", "cactus", "camel", "candle", "canoe", "canyon", "carrot",
  "castle", "cedar", "cherry", "chestnut", "cider", "cinnamon", "clover", "cloud", "cobalt", "comet", "copper", "coral", "cotton", "cozy", "crane", "creek",
  "cricket", "crystal", "cupcake", "daisy", "dawn", "delta", "desert", "dolphin", "dove", "dragon", "dune", "eagle", "ember", "falcon", "feather", "fern",
  "fiddle", "field", "firefly", "flute", "forest", "fossil", "fountain", "fox", "garden", "garnet", "ginger", "glacier", "globe", "goose", "granite", "grape",
  "harbor", "harvest", "hazel", "heron", "hickory", "honey", "horizon", "island", "ivory", "jasmine", "jelly", "juniper", "kettle", "kite", "koala", "lagoon",
  "lantern", "lark", "lemon", "lilac", "lily", "linen", "lotus", "lucky", "magnet", "mango", "maple", "marble", "meadow", "melon", "mint", "mitten",
  "moon", "morning", "moss", "muffin", "nectar", "nutmeg", "oak", "ocean", "olive", "orchid", "otter", "owl", "paddle", "panda", "parade", "peach",
  "pearl", "pebble", "pecan", "pepper", "piano", "pickle", "pine", "planet", "plum", "pocket", "pony", "poppy", "prairie", "pumpkin", "quilt", "rabbit",
  "radish", "rain", "raven", "reef", "ribbon", "river", "robin", "rocket", "rose", "ruby", "saddle", "saffron", "sage", "sail", "salmon", "sandal",
  "sapphire", "sequoia", "shadow", "shell", "silver", "sky", "slate", "snow", "sparrow", "spice", "spruce", "squash", "star", "stone", "summer", "sunny",
  "swan", "teacup", "thistle", "thunder", "tiger", "timber", "toast", "topaz", "tulip", "turtle", "valley", "velvet", "violet", "waffle", "walnut", "willow",
];

/** Uniform integer in [0, max), by rejection sampling (no modulo bias). */
function randomBelow(max: number): number {
  const limit = Math.floor(0x100000000 / max) * max;
  const buf = new Uint32Array(1);
  for (;;) {
    globalThis.crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % max;
  }
}

export function generatePassword(): string {
  const pick = () => WORDS[randomBelow(WORDS.length)];
  return `${pick()}-${pick()}-${pick()}-${10 + randomBelow(90)}`;
}
