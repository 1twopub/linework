// Linework — curated catalog: tagging releases, and matching drawings to them.
// The catalog lives in catalog.json at the site root. build.html creates it from a Spotify playlist.

import { DIMS, MOTIF_LABELS } from './analyze.js';
import { GENRES, rng } from './mapping.js';

export const MOTIFS = Object.keys(MOTIF_LABELS);

// Words in titles that suggest each motif. Matched as whole words, case-insensitive.
export const MOTIF_PATTERNS = {
  face: ['face[sd]?', 'portraits?', 'smil(e|es|ing)', 'lips', 'mouth', 'mirror', 'strangers?', 'head'],
  sun: ['sun(s|ny|shine|set|sets|rise|light|burn|beam|flower)?', 'solar', 'summer(time)?', 'golden', 'daylight', 'dawn', 'heat'],
  circle: ['circles?', 'orbit(s|al)?', 'halo', 'round', 'eclipse', 'ring(s)?', 'zero', 'wheel(s)?', 'loop'],
  spiral: ['spiral(s|ing)?', 'vertigo', 'dizzy', 'whirl(pool|wind)?', 'galax(y|ies)', 'hypnoti[cz]e?', 'vortex', 'swirl', 'tornado', 'cyclone'],
  star: ['stars?', 'starlight', 'starry', 'constellations?', 'supernova', 'comets?', 'cosmic', 'shine', 'twinkle', 'astral'],
  grid: ['city', 'cities', 'grids?', 'windows?', 'blocks?', 'systems?', 'patterns?', 'streets?', 'metropolis', 'building(s)?', 'architecture'],
  rain: ['rain(s|y|ing|drops?|fall)?', 'storms?', 'stormy', 'downpour', 'drizzle', 'thunder(storm)?', 'monsoon', 'tears', 'weep(ing)?', 'cry(ing)?'],
  dots: ['dots?', 'confetti', 'pixels?', 'freckles', 'fireflies', 'static', 'snow(fall|flakes?)?', 'dust', 'stardust', 'sparkles?', 'bubbles'],
  zigzag: ['electric(ity)?', 'lightning', 'voltage', 'shocks?', 'sparks?', 'zig ?zag', 'bolt', 'thunderbolt', 'jolt'],
  mountain: ['mountains?', 'peaks?', 'summit', 'pyramids?', 'altitude', 'cliffs?', 'hills?', 'high(er|est)?', 'climb(ing)?', 'volcano'],
  wave: ['waves?', 'ocean(s)?', 'sea', 'tides?', 'surf(ing)?', 'current(s)?', 'drift(ing)?', 'water', 'river(s)?'],
  loops: ['loops?', 'tangled?', 'knots?', 'ribbons?', 'swirls?', 'twist(ed)?', 'circus', 'roller ?coaster', 'curls?', 'lasso'],
  horizon: ['horizons?', 'skylines?', 'distance', 'shore(line)?', 'plains', 'desert', 'landscape', 'fields?', 'prairie', 'flatland', 'sky'],
  line: ['lines?', 'straight', 'paths?', 'roads?', 'highway', 'one way', 'rails?', 'wire'],
  scribble: ['chaos', 'chaotic', 'noise', 'scribble', 'mess(y)?', 'riot', 'frenzy', 'madness', 'crazy', 'wild', 'havoc'],
  heart: ['hearts?', 'heartbreak(er)?', 'heartache', 'love(s|r|rs|ly|sick)?', 'loving', 'valentines?', 'romance', 'romantic', 'kiss(es|ing|ed)?', 'darling', 'sweetheart', 'adore'],
  house: ['house', 'home(s|coming|sick)?', 'roof(top)?', 'doors?', 'doorstep', 'apartment', 'kitchen', 'bedroom', 'rooms?', 'crib', 'castle', 'mansion', 'cabin', 'palace'],
  flower: ['flowers?', 'roses?', 'bloom(s|ing)?', 'blossom(s|ing)?', 'gardens?', 'daisy', 'daisies', 'lily', 'lilies', 'tulips?', 'orchids?', 'petals?', 'sunflowers?', 'lotus', 'violets?', 'jasmine', 'bouquet', 'floral'],
  moon: ['moon(s|light|lit|shine|beam|walk)?', 'lunar', 'crescent', 'luna'],
  eye: ['eyes?', 'eyed', 'eyelids?', 'visions?', 'gaze', 'stare', 'sight', 'blind', 'iris', 'watching', 'glance'],
  cross: ['cross(es|ed|ing|roads)?', 'church', 'pray(er|ers|ing)?', 'jesus', 'christ', 'holy', 'faith', 'amen', 'saints?', 'crucifix', 'calvary', 'hallelujah', 'god', 'lord', 'heaven(ly)?', 'bless(ed|ing|ings)?', 'gospel', 'angels?', 'sermon', 'psalms?'],
  box: ['box(es|ed)?', 'squares?', 'cubes?', 'cages?', 'caged', 'prison', 'jail', 'locked', 'frames?', 'package', 'crates?', 'trapped'],
  arrow: ['arrows?', 'directions?', 'forward', 'onwards?', 'targets?', 'aim(ing)?', 'pointing', 'compass', 'bullseye'],
  figure: ['man', 'men', 'woman', 'women', 'girls?', 'boys?', 'person', 'people', 'bod(y|ies)', 'human', 'child(ren)?', 'lady', 'ladies', 'dancers?', 'gentlem[ae]n'],
  bird: ['birds?', 'birdsong', 'wings?', 'fly(ing)?', 'flight', 'feathers?', 'doves?', 'crows?', 'eagles?', 'sparrows?', 'swallows?', 'raven', 'robins?', 'pigeons?', 'owls?', 'hawks?', 'blackbird', 'songbird', 'swans?', 'nest', 'soar(ing)?', 'canary'],
  cloud: ['clouds?', 'cloudy', 'cloud nine', 'fog(gy)?', 'mist(y)?', 'haze', 'hazy', 'smok(e|ey|y|in|ing)', 'vapou?rs?', 'overcast', 'steam'],
  crown: ['kings?', 'queens?', 'crown(s|ed)?', 'royal(ty|s)?', 'prince(ss)?', 'throne', 'kingdom', 'empire', 'reign', 'majesty', 'emperor', 'regal'],
  diamond: ['diamonds?', 'ice', 'icy', 'iced', 'jewel(s|ry|ery)?', 'gems?', 'crystals?', 'bling', 'carats?', 'vvs', 'pearls?', 'sapphire', 'emerald', 'ruby'],
  drop: ['drips?', 'drippy', 'drip(ping|pin)', 'drops?', 'drown(s|ing|ed)?', 'tears', 'teardrops?', 'sweat', 'wet', 'splash', 'puddle', 'liquid', 'leak(ing)?'],
  flame: ['fire', 'fires', 'flames?', 'burn(s|ing|in|ed|t)?', 'blaze', 'blazing', 'lit', 'hot', 'inferno', 'torch', 'firestarter', 'ignite', 'matches'],
  money: ['money', 'cash', 'bands', 'racks?', 'dollars?', 'bank(roll)?', 'rich(es)?', 'paid', 'bags?', 'bread', 'guap', 'bucks', 'millions?', 'millionaires?', 'billions?', 'billionaires?', 'profit', 'commas', 'broke', 'wealth', 'fortune', 'currency', 'payday', 'hundreds'],
  note: ['music', 'musi[ck]', 'muzik', 'songs?', 'melod(y|ies)', 'tunes?', 'sing(s|ing|in|er|ers)?', 'notes?', 'lullaby', 'harmony', 'chorus', 'hymns?', 'anthems?', 'ballads?', 'serenade', 'symphony', 'rhythm', 'sounds?', 'radio', 'piano', 'guitar', 'beats'],
  clock: ['time', 'times', 'clocks?', 'hours?', 'minutes?', 'seconds', "o'clock", 'tonight', 'forever', 'yesterday', 'tomorrow', 'someday', 'lately', 'timeless', 'countdown', 'midnight', 'morning', 'seasons'],
  globe: ['world(s|wide)?', 'earth', 'globe', 'global', 'planet(s|ary)?', 'universe', 'universal', 'international', 'nations?', 'continents?', 'atlas', 'maps?', 'atlanta to the world'],
  skull: ['skulls?', 'dead', 'death', 'die', 'dies', 'dying', 'died', 'grave(s|yard)?', 'bones?', 'kill(s|er|ers|ing|in)?', 'murder(s|er)?', 'r\\.i\\.p\\.?', 'rest in peace', 'funeral', 'coffin', 'casket', 'corpse', 'zombies?', 'ghosts?', 'demons?', 'devil', 'hell', 'evil', 'reaper', 'cemetery'],
  car: ['cars?', 'rid(e|es|ing|in)', 'whips?', 'driv(e|es|er|ing|in)', 'benz', 'mercedes', 'porsche', 'trucks?', 'coupe', 'lambo', 'lamborghini', 'bentley', 'ferrari', 'cadillac', 'caddy', 'chevy', 'impala', 'jeep', 'racing', 'race', 'garage', 'parking', 'speed(ing)?', 'vroom', 'cruis(e|ing|in)'],
  phone: ['phones?', 'call(s|ing|in)?', 'hotline', 'text(s|ing|in|ed)?', 'cell', 'dial(ing)?', 'voicemail', 'facetime', 'telephone', 'ringtone', 'iphone', 'blackberry', 'pager', 'messages?'],
  screen: ['tv', 'television', 'screens?', 'videos?', 'movies?', 'films?', 'cameras?', 'pictures?', 'photos?', 'cinema', 'channels?', 'showtime', 'broadcast', 'youtube', 'stream(ing)?', 'theater', 'theatre', 'soundtrack'],
  bubble: ['talk(s|ing|in)?', 'speak(s|ing|in)?', 'said', 'tell(s|ing|in)?', 'told', 'stor(y|ies)', 'words?', 'voices?', 'conversations?', 'chat(ter|ting)?', 'gossip', 'rumou?rs?', 'whispers?', 'shout(s|ing|out)?', 'scream(s|ing|in)?', 'lies', 'liar', 'truth', 'ask(ed|ing|in)?', 'answers?', 'questions?', 'languages?', 'speech', 'interview', 'quotes?'],
  abstract: ['shapes?', 'forms?', 'abstract(ion)?', 'gestures?', 'figures?', 'sketch(es)?', 'drawings?', 'lines and', 'colou?rs?', 'art'],
};

const MOTIF_RE = Object.fromEntries(
  Object.entries(MOTIF_PATTERNS).map(([m, words]) => [m, new RegExp(`\\b(${words.join('|')})\\b`, 'i')]),
);

// Drawings that look alike share some credit.
export const RELATED = {
  face: ['eye', 'figure', 'circle', 'skull'], sun: ['circle', 'flower', 'star', 'flame'], circle: ['moon', 'sun', 'eye', 'spiral', 'clock', 'globe'],
  spiral: ['loops', 'circle', 'wave'], star: ['sun', 'cross', 'moon', 'diamond', 'crown'], grid: ['box', 'line', 'house'],
  rain: ['cloud', 'line', 'dots', 'drop'], dots: ['rain', 'star', 'scribble'], zigzag: ['mountain', 'arrow', 'scribble'],
  mountain: ['zigzag', 'house', 'horizon'], wave: ['horizon', 'bird', 'loops'], loops: ['spiral', 'cloud', 'scribble'],
  horizon: ['line', 'wave', 'mountain'], line: ['arrow', 'horizon', 'grid'], scribble: ['loops', 'zigzag', 'abstract'],
  heart: ['face', 'flower', 'circle'], house: ['box', 'mountain', 'grid'], flower: ['sun', 'heart', 'star'],
  moon: ['circle', 'star', 'cloud'], eye: ['face', 'circle', 'moon'], cross: ['star', 'grid', 'line'],
  box: ['grid', 'house', 'line', 'phone', 'screen'], arrow: ['line', 'zigzag'], figure: ['face', 'line'],
  bird: ['wave', 'cloud', 'zigzag'], cloud: ['rain', 'loops', 'moon'],
  crown: ['star', 'mountain', 'zigzag'], diamond: ['star', 'box', 'mountain'], drop: ['rain', 'flame', 'heart'],
  flame: ['drop', 'sun', 'zigzag'], money: ['wave', 'box', 'line'], note: ['line', 'bird', 'eye'],
  clock: ['circle', 'face', 'globe'], globe: ['circle', 'clock', 'sun'], skull: ['face', 'cross', 'eye'],
  car: ['box', 'circle', 'line'], phone: ['box', 'screen'], screen: ['box', 'phone', 'grid'],
  bubble: ['cloud', 'face', 'phone'],
  abstract: ['scribble'],
};

// Genre/tag text (MusicBrainz tags, or Spotify genres in older catalogs) → Linework genre. Order matters: more specific first.
const GENRE_RULES = [
  [/comedy|stand-?up|humou?r|parody|novelty|spoken comedy/, 'comedy'],
  [/drum and bass|drum & bass|\bdnb\b|jungle|liquid funk/, 'drum and bass'],
  [/trip hop|trip-hop/, 'trip hop'],
  [/dream pop|ethereal/, 'dream pop'],
  [/shoegaze|nu gaze/, 'shoegaze'],
  [/post-punk|post punk|darkwave|coldwave|gothic rock|no wave/, 'post-punk'],
  [/grime|uk rap|road rap/, 'grime'],
  [/drill/, 'drill'],
  [/cloud rap|plugg|pluggnb|drain|hyphy-?wave|emo rap/, 'cloud rap'],
  [/\btrap\b|crunk|snap|rage|atl hip hop|memphis rap/, 'trap'],
  [/dancehall|ragga/, 'dancehall'],
  [/salsa|cumbia|latin|reggaeton|corrido|bachata|merengue/, 'latin'],
  [/hardcore|grindcore|screamo|powerviolence/, 'hardcore'],
  [/punk/, 'punk'],
  [/metal|doom|sludge|djent|thrash/, 'metal'],
  [/grunge/, 'grunge'],
  [/industrial|\bebm\b/, 'industrial'],
  [/noise/, 'noise'],
  [/techno/, 'techno'],
  [/house|uk garage|speed garage/, 'house'],
  [/disco/, 'disco'],
  [/synthpop|synth-pop|synthwave|electropop|electroclash/, 'synthpop'],
  [/new wave/, 'new wave'],
  [/dance-pop|europop|electro-?pop/, 'synthpop'],
  [/\bdance\b|\bedm\b|electro house|eurodance/, 'house'],
  [/progressive rock|\bprog\b|art rock/, 'psychedelic rock'],
  [/post-rock|post rock/, 'ambient'],
  [/krautrock|kosmische|motorik/, 'krautrock'],
  [/psych/, 'psychedelic rock'],
  [/ambient|drone|new age|space music/, 'ambient'],
  [/minimalism|minimal/, 'minimal'],
  [/classical|baroque|orchestra|opera|chamber|compositional|romantic era|piano/, 'classical'],
  [/jazz|bebop|swing|big band/, 'jazz'],
  [/gospel|worship|christian/, 'gospel'],
  [/funk/, 'funk'],
  [/contemporary r&b|alternative r&b|r&b|rnb|new jack swing/, 'r&b'],
  [/soul|motown/, 'soul'],
  [/reggae|dub|ska|rocksteady/, 'reggae'],
  [/bossa|samba|\bmpb\b|tropicalia|brazil/, 'bossa nova'],
  [/blues/, 'blues'],
  [/country|americana|bluegrass|honky/, 'country'],
  [/hip hop|hip-hop|\brap\b|boom bap/, 'hip hop'],
  [/lo-fi|lofi|bedroom/, 'lo-fi'],
  [/singer.?songwriter/, 'singer-songwriter'],
  [/folk/, 'folk'],
  [/\bidm\b|electronica|downtempo|glitch|chillwave|leftfield/, 'electronica'],
  [/experimental|avant|free improvisation|musique concrete/, 'experimental'],
  // Catch-alls: count for less, so a specific tag ("shoegaze") beats a common one ("rock").
  [/electronic/, 'electronica', 0.35],
  [/indie|alternative|rock|britpop|pop/, 'indie rock', 0.35],
];

// Accepts plain strings or { name, count } tags; tags with more votes count for more.
export function genreFromArtistGenres(list) {
  const votes = new Map();
  for (const raw of list || []) {
    const g = String(typeof raw === 'string' ? raw : raw?.name || '').toLowerCase();
    const weight = typeof raw === 'string' ? 1 : Math.sqrt(Math.max(1, Number(raw?.count) || 1));
    const idx = GENRE_RULES.findIndex(([re]) => re.test(g));
    if (idx >= 0) votes.set(idx, (votes.get(idx) || 0) + weight * (GENRE_RULES[idx][2] ?? 1));
  }
  if (!votes.size) return null;
  // Most votes wins; ties go to the more specific rule.
  const [idx] = [...votes.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
  return GENRE_RULES[idx][1];
}

// Removes credits and edition notes so names don't count: "White (feat. Frank Ocean)" isn't about the sea.
export function cleanTitle(text) {
  return String(text || '')
    .replace(/\s*[([][^)\]]*\b(feat|ft|with|remix|mix|prod|compiled|version|remaster(ed)?|edition|live|bonus|deluxe|instrumental|edit|demo|explicit|clean|hosted|chopped|screwed|presents?)\b[^)\]]*[)\]]/gi, ' ')
    .replace(/\s+-\s+[^-]*\b(remaster(ed)?|live|version|mix|remix|edit|demo|instrumental|mono|stereo|single|bonus)\b.*$/i, '')
    .replace(/\s(feat\.?|ft\.|featuring)\s.*$/i, '')
    .replace(/\b(sun ra|pop smoke|frank ocean|box set|gilles peterson presents|ice cream|johnny cash)\b/gi, ' ');
}

// Finds motifs in titles. `texts` is [{ text, weight }]. Returns { motif: matchedTitle }, strongest first.
// `exclude`: names to ignore in titles, normally the record's own artists ("King Krule" isn't a crown).
export function motifsFromText(texts, exclude = []) {
  const scores = {};
  const where = {};
  const names = exclude.map((n) => String(n || '').trim()).filter((n) => n.length >= 3)
    .map((n) => new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}('s|s)?\\b`, 'gi'));
  for (const { text, weight } of texts) {
    if (!text) continue;
    let clean = cleanTitle(text);
    for (const re of names) clean = clean.replace(re, ' ');
    for (const [m, re] of Object.entries(MOTIF_RE)) {
      if (re.test(clean)) {
        scores[m] = (scores[m] || 0) + weight;
        if (!where[m] || weight > where[m].weight) where[m] = { text, weight };
      }
    }
  }
  return Object.fromEntries(
    Object.keys(scores).sort((a, b) => scores[b] - scores[a]).slice(0, 4).map((m) => [m, where[m].text]),
  );
}

// Title hints: words that suggest a motif without naming it ("baby" → heart, "east" → arrow on a compass).
// Weaker than a title naming the thing; only used when the title doesn't already name that motif.
export const HINT_PATTERNS = {
  heart: ['babe', 'bae', 'boo', 'honey', 'sweet(ie|ness|er|est)?', 'luv', 'crush', '(girl|boy)friends?', 'wife', 'husband', 'marr(y|ied|iage)', 'wedding', 'passion', 'desire', 'miss you', 'need you', 'want you', 'together', 'pink', 'affection', 'tender', 'intimate', 'devotion', 'soulmate', 'beloved', 'xoxo', 'ily', 'baby'],
  cloud: ['minds?', 'thoughts?', 'think(ing|in)?', 'dream(s|ing|in|y|er|ers)?', 'daydream', 'imagin(e|ation)', 'memor(y|ies)', 'remember', 'forget', 'wonder(ing|in)?', 'ideas?', 'brain', 'conscious(ness)?', 'meditat(e|ion)', 'white', 'purple', 'gr[ae]y', 'weather', 'air', 'breath(e|ing)?', 'float(ing|in)?', 'dope', 'kush', 'weed', 'blunts?', 'joints?', 'stoned', 'vibe(s|z)?', 'chill(in|ing)?'],
  circle: ['roll(in|ing|er|ers)?', 'skating', 'wheel', 'pac-?man', 'packman', 'lunch(room)?', 'dinner', 'breakfast', 'food', 'eat(ing|in)?', 'munch', 'snack', 'hungry', 'pizza', 'burgers?', 'tacos?', 'plates?', 'nothing', 'none', 'zero', 'empty', 'void', 'hollow', 'around', 'again', 'repeat', 'cycle', 'whole', 'complete', 'balls?', 'coins?', 'donuts?', 'pie', 'apples?', 'oranges?', 'cookies?', 'globe'],
  figure: ['boyz', 'girlz', 'gurl', 'grl', 'hobos?', 'tony', 'ben', 'sally', 'agnes', 'junie', 'mary', 'john(ny)?', 'jack', 'mike', 'bobby', 'billy', 'jimmy', 'joe', 'sam', 'sue', 'annie', 'lucy', 'lola', 'linda', 'nancy', 'penelope', 'louie', 'louis', 'eddie', 'stagolee', 'mcgerk', 'kids?', 'child', 'sons?', 'daughters?', 'father', 'mother', 'mom(ma|my)?', 'dad(dy)?', 'brothers?', 'sisters?', 'family', 'friends?', 'homie(s)?', 'bro', 'gang', 'crew', 'squad', 'team', 'nobody', 'somebody', 'everybody', 'anybody', 'she', 'he', 'her', 'him', 'myself', 'yourself', 'self', 'alone', 'lonely', 'solo', 'hero(es)?', 'villains?', 'savages?', 'freaks?', 'bitch(es)?', 'hoes?', 'thugs?', 'gangsters?', 'hustlers?', 'players?', 'pimps?', 'guys?', 'dude', 'dawg', 'folks', 'crowd', 'n[i*]gg?as?', 'n[i*]gg?az'],
  note: ['jam(s)?', 'riddims?', 'cypher', 'ska', 'dj', 'remix', 'ep', 'lp', 'cd', 'demo', 'beats?', 'party', 'parties', 'partying', 'club', 'dancing', 'disco', 'groove', 'funk(y)?', 'jazz', 'rock', 'punk', 'hip hop', 'hip-hop', 'rap', 'dub(s)?', 'mixtapes?', 'remixes', 'soul', 'blues', 'bass', 'drums?', '808s?', 'tracks?', 'playlist', 'albums?', 'records?', 'vinyl', 'studio', 'concert', 'stage', 'mic', 'microphone', 'opera', 'orchestra', 'choir', 'band', 'autotune', 'swing', 'allegro', 'concerto', 'sonata', 'overture', 'aria', 'singles'],
  arrow: ['run(s|ning|nin)?', 'walk(s|ing|in)?', 'step(s|pin|ping)?', 'steppin', 'feet', 'foot', 'mov(e|es|ing|in|ement)', 'motion', 'travel(s|ing|in)?', 'journey', 'gone', 'away', 'leav(e|ing|in)', 'escape', 'chase', 'pull up', 'run up', 'east(side)?', 'west(side)?', 'north(side)?', 'south(side)?', 'turn(s|t|ing|in|ed)?', 'faster', 'fast', 'quick', 'rush', 'throttle', 'jump(s|ing|in)?', 'throw', 'shoot(ing|in)?', 'shots?', 'bullets?', 'point', 'next', 'ahead', 'flight'],
  star: ['santa', 'christmas', 'xmas', 'champ(ion)?', 'masters?', 'vanguard', 'visionar(y|ies)', 'icon(ic)?', 'multiverse', 'gravity', 'demigods?', 'best', 'greatest', 'hits', 'legend(s|ary)?', 'super', 'famous', 'fame', 'celebrity', 'champions?', 'winners?', 'win(s|ning|nin)?', 'top', 'number one', 'first', 'platinum', 'shining', 'bright', 'glow(ing)?', 'sparkl(e|ing)', 'wish(es)?', 'lucky', 'luck', 'magic(al)?', 'miracles?', 'great', 'awesome', 'space', 'galactic', 'cosmos', 'astronaut', 'rocket', 'aliens?', 'pluto', 'mars', 'saturn', 'venus', 'jupiter', 'neptune', 'mercury', 'nova', 'astro', 'orion'],
  crown: ['proper', 'etiquette', 'manners', 'noble', 'boss(es)?', 'chief', 'ceo', "don(?!['’])", 'mogul', 'rulers?', 'rules?', 'presidents?', 'presidential', 'leaders?', 'kingpin', 'highness', 'tycoon'],
  diamond: ['swag(ger|gin|gy)?', 'flex(in|ing)?', 'fresh', 'luxury', 'designer', 'gucci', 'prada', 'versace', 'louis', 'vuitton', 'cartier', 'rolex', 'patek', 'chains?', 'necklace', 'earrings?', 'bust down', 'flawless', 'expensive', 'glitter', 'glam(our)?', 'shiny', 'sparkle', 'perfect', 'rare', 'precious'],
  flower: ['life', 'living', 'alive', 'pretty', 'beautiful', 'beauty', 'gorgeous', 'cute', 'lovely', 'spring', 'green', 'nature', 'plants?', 'trees?', 'leaf', 'leaves', 'forest', 'woods?', 'grass', 'herb', 'peach(es)?', 'cherr(y|ies)', 'fruits?', 'plums?', 'seeds?', 'grow(ing|in|th)?', 'paradise', 'eden'],
  drop: ['slime(ball|balls|y|s)?', 'wet', 'dew', 'lean', 'codeine', 'sip(s|pin|ping)?', 'drink(s|ing|in)?', 'drank', 'liquor', 'wine', 'champagne', 'henny', 'alcohol', 'cups?', 'soda', 'fanta', 'sprite', 'juice', 'milk', 'blood(y)?', 'bleed(ing|in)?', 'slime', 'slimy', 'melt(ing|in)?', 'pour(ing|in)?', 'spill', 'pills?', 'drugs?', 'molly', 'percs?', 'percocet', 'xans?', 'xanax', 'potion', 'sauce', 'syrup'],
  flame: ['warmth', 'volcanic', 'rebels?', 'red', 'rage', 'angry', 'anger', 'mad', 'hate', 'haters?', 'fury', 'furious', 'spicy', 'pepper', 'heat(ed)?', 'warm', 'passion', 'dragon', 'phoenix', 'volcano', 'explode', 'explosion'],
  skull: ['ammo', 'm-?16', 'pistolz', 'satan(ic)?', 'sinners?', 'damaged', 'suffer(ing)?', 'hurt(in|ing|s)?', 'trouble', 'oblivion', 'lobotomy', 'kkk', 'loaded', 'troll', 'bad', 'violen(ce|t)', 'wars?', 'guns?', 'glocks?', 'pistols?', 'rifle', 'choppa', 'shooters?', 'opps?', 'enem(y|ies)', 'beef', 'monsters?', 'dirty', 'danger(ous)?', 'crimes?', 'criminal', 'suicide', 'poison', 'toxic', 'horror', 'scary', 'fear', 'nightmares?', 'terror', 'sins?', 'wicked', 'doom', 'blacula', 'vampires?', 'apocalypse', 'end of the world', 'graveyard', 'halloween', 'helloween', 'witch(es)?', 'curse(d)?', 'grim', 'massacre'],
  box: ['tables?', 'seats?', 'dresser', 'dishwasher', 'chairs?', 'couch', 'sofa', 'desk', 'shelf', 'catalog', 'deleted', 'pressed', 'tapes?', 'collection', 'anthology', 'library', 'archives?', 'vol(ume)?s?', 'bricks?', 'safe', 'vault', 'gifts?', 'trunk', 'briefcase', 'suitcase', 'cases?', 'compilation', 'catalogu?e', 'edition', 'set', 'blocks?', 'container', 'basket', 'chest'],
  grid: ['town', 'hood', 'ave(nue)?', 'boulevard', 'blvd', 'side', 'ghetto', 'projects', 'trenches', 'slums?', 'suburbs?', 'uptown', 'downtown', 'midtown', 'neighbou?rhood', 'district', 'ward', 'zone', 'area', 'metro', 'urban', 'concrete', 'corners?', 'plaza', 'market', 'mall'],
  globe: ['arizona', 'montana', 'nevada', 'colorado', 'alabama', 'mississippi', 'tennessee', 'kentucky', 'louisiana', 'oklahoma', 'kansas', 'missouri', 'michigan', 'minnesota', 'wisconsin', 'iowa', 'oregon', 'washington', 'utah', 'idaho', 'alaska', 'hawaii', 'boston', 'seattle', 'denver', 'dallas', 'austin', 'phoenix', 'portland', 'nashville', 'jersey', 'gaza', 'palestine', 'israel', 'iran', 'iraq', 'syria', 'turkey', 'greece', 'montreal', 'vancouver', 'sydney', 'australia', 'latin(a|o)?', 'gothlantastan', 'land', 'lands', 'states', 'america(n|ns)?', 'usa', 'u\\.s\\.a\\.?', 'africa(n)?', 'europe(an)?', 'asia(n)?', 'japan(ese)?', 'tokyo', 'china', 'chinese', 'london', 'paris', 'france', 'french', 'brazil(ian)?', 'mexic(o|an)', 'jamaica(n)?', 'kingston', 'atlanta', 'atl', 'detroit', 'memphis', 'chicago', 'chi-?town', 'chiraq', 'new york', 'nyc', 'brooklyn', 'bronx', 'harlem', 'houston', 'texas', 'miami', 'florida', 'california', 'cali', 'los angeles', 'compton', 'oakland', 'bay area', 'philly', 'philadelphia', 'toronto', 'canada', 'england', 'uk', 'ireland', 'irish', 'sweden', 'swedish', 'stockholm', 'berlin', 'german(y)?', 'russia(n)?', 'nigeria(n)?', 'lagos', 'ghana', 'haiti(an)?', 'cuba(n)?', 'puerto rico', 'dubai', 'osaka', 'seoul', 'korea(n)?', 'ital(y|ian)', 'rome', 'spain', 'spanish', 'india(n)?', 'egypt(ian)?', 'babylon', 'zion', 'ethiopia(n)?', 'vegas', 'nola', 'new orleans', 'georgia', 'carolina', 'virginia', 'ohio', 'cleveland', 'baltimore', 'freetown', 'foreign', 'abroad', 'overseas', 'tour(ing)?', 'countr(y|ies)', 'nation(al)?', 'outer space', 'east coast', 'west coast', 'world'],
  wave: ['flow', 'seahorse', 'river', 'rinsed', 'wash(ed)?', 'blue', 'beach', 'islands?', 'coast', 'sail(ing)?', 'boats?', 'ships?', 'yacht', 'swim(ming)?', 'pool', 'bath', 'lake', 'bay', 'harbou?r', 'waterfall', 'tsunami', 'flood', 'fish(es|ing)?', 'dolphins?', 'whales?', 'sharks?', 'mermaids?', 'calm', 'smooth', 'cool', 'deep', 'sea', 'marine', 'aqua', 'navy', 'sailor', 'anchor', 'dive', 'diving'],
  moon: ['nights?', 'dark(ness|er|est)?', 'black', 'sleep(ing|in|less)?', 'asleep', 'bed(time)?', 'nocturn(al|e)', 'evening', 'dusk', 'twilight', 'shadows?', 'lights out', 'insomnia', 'werewolf', 'goth(ic)?', 'after hours', 'late night', '3am', '4am', 'dreamland'],
  sun: ['shade', 'degrees', 'mirage', 'desert', 'days?', 'daytime', 'lights?', 'yellow', 'orange', 'happy', 'happiness', 'joy(ful)?', 'tropical', 'sunday', 'positive', 'holiday', 'vacation', 'shine', 'good vibes', 'bright side', 'rays', 'beam', 'glory', 'easter'],
  dots: ['cold', 'winter', 'freez(e|ing|in)', 'frozen', 'frost(y)?', 'sprinkles?', 'salt', 'sugar', 'cand(y|ies)', 'popcorn', 'crumbs', 'sand', 'spots?', 'polka', 'specks?', 'gum', 'chicken', 'beans', 'rice', 'grain', 'pepper', 'stars'],
  zigzag: ['energy', 'power(ful)?', 'zap', 'buzz(ing|in)?', 'bang(s|ing|in|er)?', 'boom', 'blast', 'crash', 'punch', 'fight(s|ing|in|er|ers)?', 'broken', 'break(s|ing|in)?', 'crack(ed|s)?', 'glitch', 'loud', 'turbo', 'nitro', 'alerts?', 'alarm', 'warning', 'sirens?', 'hype', 'turnt', 'rage', 'wild out', 'mosh', 'storm'],
  mountain: ['stronger', 'strong', 'hard', 'tough', 'ceilings?', 'higher', 'rise', 'rising', 'level up', 'elevat(e|ed|ion)', 'above', 'heights?', 'stairs', 'stairway', 'stones?', 'towers?', 'skyscrapers?', 'rock bottom', 'top floor', 'upper', 'grand', 'giant', 'big', 'huge', 'tall'],
  spiral: ['trip(py|pin|ping|s)?', 'lost', 'confus(ed|ion)', 'spin(s|ning|nin)?', 'infinit(e|y)', 'endless', 'eternal', 'eternity', 'maze', 'hypnosis', 'deja vu', 'paranoi(a|d)', 'anxiety', 'insane', 'psycho', 'psychedelic', 'mystery', 'mysterious', 'twilight zone', 'time machine', 'drugs'],
  scribble: ['shit', 'fuck(ing|in|ed)?', 'damn', 'dumb', 'stupid', 'silly', 'fools?', 'foolish', 'clowns?', 'ugly', 'weird', 'strange', 'bizarre', 'random', 'freestyle', 'wtf', 'lol', 'funny', 'jokes?', 'comedy', 'prank', 'nonsense', 'gibberish', 'mumble', 'goofy', 'trash', 'garbage', 'junk'],
  line: ['long', 'slow(ly)?', 'steady', 'stretch', 'simple', 'plain', 'flat', 'single', 'far', 'linear', 'strings?', 'rope', 'thread', 'cable', 'edge', 'limits?', 'boundary', 'cuts?', 'slice', 'knife', 'swords?', 'blades?', 'razor', 'needle', 'stick', 'lane', 'train', 'trains'],
  eye: ['sentry', 'guard(ian)?', 'watchers?', 'controversy', 'concerned', 'look(s|ing|in)?', 'lookin', 'seen', 'witness', 'views?', 'spy', 'observe', 'focus', 'peep', 'clear', 'shades', 'glasses', 'sunglasses', 'reflect(ion|ions|ing)?', 'envy', 'jealous(y)?', 'evil eye', 'third eye', 'wink', 'notice', 'appear', 'disappear', 'invisible', 'hidden', 'hide', 'secret'],
  face: ['tattoos?', 'piercings?', 'sad', 'laugh(s|ing|in|ter)?', 'moods?', 'moody', 'emotion(s|al)?', 'masks?', 'masked', 'makeup', 'teeth', 'tongues?', 'nose', 'hair', 'skin', 'selfie', 'beard', 'honest(y)?', 'fake', 'shy', 'blush', 'grin', 'frown', 'cheeks?', 'kisses', 'yourself', 'person'],
  house: ['traps?', 'trap(pin|ping|per|pers)', 'stay(ing|in)?', 'inside', 'indoors', 'welcome', 'basement', 'attic', 'hotel', 'motel', 'condo', 'hut', 'shelter', 'neighbou?rs?', 'household', 'domestic', 'cozy', 'lodge', 'cottage'],
  cross: ['spells?', 'rituals?', 'heal(in|ing)?', 'krishna', 'pilgrimage', 'allah', 'misa', 'buddha', 'om', 'karma', 'soul', 'spirit(s|ual)?', 'hope', 'grace', 'mercy', 'forgiv(e|en|eness)', 'sacred', 'divine', 'prophet', 'moses', 'bible', 'salvation', 'redemption', 'redeem(er)?', 'praise', 'worship', 'testimony', 'glory', 'believe', 'belief', 'peace', 'holy ghost', 'pastor', 'preacher', 'cathedral', 'temple', 'chapel', 'x'],
  bird: ['icarus', 'spiderr?', 'monky', 'free(dom)?', 'dogs?', 'doggy', 'dawgs', 'cats?', 'kitty', 'rabbits?', 'bunny', 'monkeys?', 'apes?', 'gorilla', 'lions?', 'tigers?', 'bears?', 'wolf', 'wolves', 'fox', 'horses?', 'pony', 'pigs?', 'goats?', 'cows?', 'bulls?', 'snakes?', 'rats?', 'mouse', 'mice', 'bugs?', 'spiders?', 'bees?', 'butterfl(y|ies)', 'chickens?', 'ducks?', 'frogs?', 'lizards?', 'dragons?', 'bats?', 'crabs?', 'snails?', 'turtles?', 'pandas?', 'zebras?', 'giraffes?', 'elephants?', 'dinosaurs?', 'animals?', 'creatures?', 'zoo', 'jungle', 'wild', 'airplane', 'planes?', 'jets?', 'kites?'],
  car: ['motors?', 'engines?', 'gas', 'fuel', 'tank', 'bikes?', 'motorcycles?', 'bus', 'taxi', 'cabs?', 'limo', 'vans?', 'uber', 'tires?', 'traffic', 'license', 'roads?', 'highway', 'freeway', 'skrrt', 'skrt', 'brakes', 'turbo', 'hood rich'],
  phone: ['hello', 'holla', 'hit me up', 'numbers?', 'digits', 'dm', 'snap(chat)?', 'insta(gram)?', 'twitter', 'tiktok', 'online', 'internet', 'wi-?fi', 'signal', 'connect(ed|ion)?', 'e-?mail', 'mail', 'letters?', 'reach'],
  screen: ['games?', 'gamer', 'play(ing|in)?', 'playstation', 'xbox', 'nintendo', 'sega', 'arcade', 'anime', 'cartoons?', 'comics?', 'netflix', 'hollywood', 'actors?', 'actress', 'scenes?', 'episodes?', 'sequel', 'trailer', 'premiere', 'director', 'script', 'drama', 'reality', 'vhs', 'dvd', 'computer', 'laptop', 'digital', 'cyber', 'matrix', 'virtual', 'simulation', 'npcs?', 'motion picture', 'show'],
  clock: ['(19|20)\\d\\d', "'\\d\\ds", 'nineties', 'eighties', 'seventies', 'tuesdays?', 'saturdays?', 'mondays?', 'fridays?', 'weekend', 'late', 'early', 'soon', 'wait(ing|in)?', 'days', 'weeks?', 'years?', 'months?', 'ages?', 'old', 'young', 'before', 'after', 'past', 'future', 'history', 'birthday', 'anniversary', 'new year', 'century', 'decade', 'generations?', 'era', 'moments?', 'instant', 'pause', 'patience', 'delay', 'retro', 'vintage', 'classic', 'eternal', 'then', 'still', 'daily', 'everyday', 'overtime'],
  money: ['thousands?', 'nickels?', 'dimes?', 'quarters?', 'pennies', 'double', 'triple', '\\d{2,4}', 'nine', 'dolla', 'mvp', 'bricks?', 'jug(g|gin|ging|gs)?', 'juug', 'finesse(r|rs|in|ing)?', 'hustl(e|er|ers|in|ing)', 'grind(ing|in)?', 'work(in|ing)?', 'paper', 'cheese', 'stacks?', 'lotto', 'lottery', 'jackpot', 'casino', 'bets?', 'gambl(e|ing)', 'dice', 'deals?', 'dealers?', 'plugs?', 'business', 'sales?', 'buy', 'sell(ing|in)?', 'price', 'cost', 'cheap', 'pay(s|ing|day)?', 'tax(es)?', 'rent', 'bills?', 'invest(ment|ments)?', 'stocks?', 'crypto', 'bitcoin', 'ball(in|ing|er|ers)', 'scam(mer|mers|ming|min)?', 'green', 'gold', 'grams?', 'pounds?', 'ounces?', 'zips?', 'birds'],
  bubble: ['woah', 'whoa', 'nah', 'gimm(e|ie)', 'wow', 'huh', 'okay', 'ok', 'relate', 'say(s|ing|in)?', 'sorry', 'thank(s| you)?', 'names?', 'call me', 'hey', 'yo', 'listen', 'hear', 'heard', 'conversate', 'discuss', 'argue', 'argument', 'promise', 'swear', 'confess(ion)?', 'secrets?', 'explain', 'message', 'letter', 'reply', 'respond', 'excuse', 'excuses', 'blah', 'yap', 'talkin'],
};
for (const k of Object.keys(HINT_PATTERNS)) if (!HINT_PATTERNS[k].length) delete HINT_PATTERNS[k];

const HINT_RE = Object.fromEntries(
  Object.entries(HINT_PATTERNS).map(([m, words]) => [m, new RegExp(`\\b(${words.join('|')})\\b`, 'i')]),
);

// Sound: when a title gives nothing to go on, a record's genre suggests a motif (drill → zigzag).
// The weakest tier, so a drawing only lands on these when no title fits.
export const SOUND_MOTIFS = {
  ambient: 'cloud', 'dream pop': 'cloud', shoegaze: 'wave', folk: 'flower', 'singer-songwriter': 'heart', jazz: 'spiral',
  soul: 'heart', funk: 'loops', disco: 'star', house: 'box', techno: 'grid', 'drum and bass': 'zigzag', synthpop: 'star',
  'new wave': 'zigzag', 'post-punk': 'zigzag', punk: 'scribble', hardcore: 'zigzag', noise: 'scribble', industrial: 'grid',
  metal: 'skull', grunge: 'scribble', 'psychedelic rock': 'spiral', krautrock: 'line', minimal: 'line', classical: 'note',
  'hip hop': 'grid', 'trip hop': 'rain', 'lo-fi': 'dots', reggae: 'sun', 'bossa nova': 'wave', blues: 'rain', country: 'horizon',
  'indie rock': 'line', experimental: 'scribble', electronica: 'grid', gospel: 'cross', trap: 'money', 'cloud rap': 'cloud',
  drill: 'zigzag', grime: 'zigzag', 'r&b': 'heart', dancehall: 'wave', latin: 'sun', comedy: 'face',
};

// Hints in titles, skipping motifs the titles already name outright.
export function hintsFromText(texts, exclude = [], strong = {}) {
  const names = exclude.map((n) => String(n || '').trim()).filter((n) => n.length >= 3)
    .map((n) => new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}('s|s)?\\b`, 'gi'));
  const scores = {};
  const where = {};
  for (const { text, weight } of texts) {
    if (!text) continue;
    let clean = cleanTitle(text);
    for (const re of names) clean = clean.replace(re, ' ');
    for (const [m, re] of Object.entries(HINT_RE)) {
      if (strong[m] !== undefined || !re.test(clean)) continue;
      scores[m] = (scores[m] || 0) + weight;
      if (!where[m] || weight > where[m].weight) where[m] = { text, weight };
    }
  }
  return Object.fromEntries(
    Object.keys(scores).sort((a, b) => scores[b] - scores[a]).slice(0, 3).map((m) => [m, where[m].text]),
  );
}

// Which tier connects a record to a motif: 'title', 'hint', 'sound', or null.
export function motifTier(r, motif) {
  if (r.motifs?.[motif] !== undefined) return 'title';
  if (r.hints?.[motif] !== undefined) return 'hint';
  const titleless = !Object.keys(r.motifs || {}).length && !Object.keys(r.hints || {}).length;
  if (titleless && r.genre && SOUND_MOTIFS[r.genre] === motif) return 'sound';
  return null;
}

function hashString(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

// A release's place in linework space: its genre's profile, nudged a little so records in one genre don't tie.
// Releases with no known genre sit near the middle and are matched mostly by motif.
export function profileFor(genre, id) {
  const base = GENRES.find((g) => g.g === genre)?.p || {};
  const rand = rng(hashString(id || genre || 'x'));
  const spread = genre ? 0.06 : 0.18;
  const p = {};
  for (const d of DIMS) {
    const v = (base[d] ?? 0.5) + (rand() - 0.5) * 2 * spread;
    p[d] = Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000;
  }
  return p;
}

function distance(f, p) {
  let s = 0;
  for (const d of DIMS) s += ((f[d] ?? 0.5) - (p?.[d] ?? 0.5)) ** 2;
  return Math.sqrt(s);
}

// Picks the release for a drawing. Same drawing, same release.
export function matchRelease(analysis, catalog) {
  const releases = catalog?.releases || [];
  if (!releases.length) return null;
  const motif = analysis.motif;
  const related = RELATED[motif] || [];

  // Strength of each kind of link: the title names the drawing > hints at it > the record's sound suits it
  // > the title names a related shape.
  const TIER = { title: 1.4, hint: 0.95, sound: 0.6 };
  const scored = releases.map((r) => {
    let motifScore = 0;
    let via = null;
    const tier = motifTier(r, motif);
    if (tier) {
      motifScore = TIER[tier];
      via = { motif, kind: tier, text: tier === 'title' ? r.motifs[motif] : tier === 'hint' ? r.hints[motif] : r.genre };
    } else {
      const rel = related.find((m) => r.motifs?.[m] !== undefined);
      if (rel) { motifScore = 0.45; via = { motif: rel, kind: 'related', text: r.motifs[rel] }; }
    }
    const dist = distance(analysis.features, r.profile);
    return { r, via, dist, score: motifScore - dist };
  }).sort((a, b) => b.score - a.score);

  // Weighted pick among the closest few, so near-identical drawings can still land on different records.
  const top = scored.slice(0, Math.min(6, scored.length));
  const rand = rng(analysis.hash || 1);
  const weights = top.map((s) => Math.exp((s.score - top[0].score) * 6));
  let x = rand() * weights.reduce((a, b) => a + b, 0);
  let pick = top[0];
  for (let i = 0; i < top.length; i++) { x -= weights[i]; if (x <= 0) { pick = top[i]; break; } }

  return { ...pick.r, via: pick.via, dist: pick.dist };
}

export async function loadCatalog(url = 'catalog.json') {
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data?.releases) && data.releases.length ? data : null;
  } catch {
    return null;
  }
}
