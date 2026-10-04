-- LOCAL DEVELOPMENT ONLY. `supabase db reset` runs this after the migrations;
-- the hosted project never does. It fills the content tables so the daily
-- game, archive and admin have something to show locally: starter words for
-- Deal Random Cards and three sample puzzles ending today (server date).
-- Accounts, admins and plays start empty, exactly like a blank project.

insert into public.wordbank (word)
select unnest(array[
  'ANCHOR','APPLE','ARROW','BADGE','BALLOON','BAMBOO','BANJO','BARN','BATTERY','BEACH',
  'BELL','BISCUIT','BLANKET','BOOT','BRIDGE','BROOM','BUBBLE','BUCKET','BUTTON','CACTUS',
  'CAMEL','CANDLE','CANYON','CAPTAIN','CARPET','CASTLE','CHAIN','CHALK','CHERRY','CHESS',
  'CIRCUS','CLOCK','CLOUD','COCONUT','COMET','COMPASS','COOKIE','CORAL','COWBOY','CRAYON',
  'CROWN','CRYSTAL','CURTAIN','DAISY','DESERT','DIAMOND','DOLPHIN','DRAGON','DRUM','EAGLE',
  'ECHO','ENGINE','FEATHER','FENCE','FIDDLE','FLAME','FLUTE','FOREST','FOSSIL','FOUNTAIN',
  'GALAXY','GARDEN','GHOST','GIANT','GLACIER','GLOVE','GOBLIN','GRAPE','GUITAR','HAMMER',
  'HARBOR','HARP','HELMET','HONEY','HORIZON','ICEBERG','IGLOO','ISLAND','IVORY','JACKET',
  'JADE','JELLY','JUNGLE','KETTLE','KITE','KNIGHT','LADDER','LANTERN','LEMON','LIBRARY',
  'LIGHTHOUSE','LION','LOCKET','MAGNET','MAPLE','MARBLE','MASK','MEADOW','MERMAID','MIRROR',
  'MONSOON','MOSAIC','MOUNTAIN','MUSHROOM','NEEDLE','NEST','NOODLE','OCEAN','OLIVE','ORBIT',
  'OWL','PALACE','PAPER','PARADE','PARROT','PEARL','PENGUIN','PEPPER','PIANO','PILLOW',
  'PIRATE','PLANET','POCKET','POTION','PRISM','PUMPKIN','PUPPET','PYRAMID','QUILT','RABBIT',
  'RADAR','RAINBOW','RIBBON','ROCKET','SADDLE','SAIL','SCARF','SCROLL','SHADOW','SHELL',
  'SILVER','SKATE','SNOWMAN','SPIDER','SPONGE','STATUE','STORM','SUGAR','SUNSET','SWAN',
  'SWORD','TEAPOT','TELESCOPE','THRONE','THUNDER','TICKET','TIGER','TOMATO','TORCH','TOWER',
  'TRAIN','TREASURE','TRUMPET','TULIP','TUNNEL','UMBRELLA','UNICORN','VALLEY','VELVET','VIOLIN',
  'VOLCANO','WAGON','WALRUS','WAND','WATERFALL','WHALE','WHISTLE','WINDMILL','WIZARD','ZEBRA'
])
on conflict do nothing;

insert into public.puzzles (id, date, title, author, difficulty, status, clues, cards, solution)
select 1700000000000 + d, current_date - d, t.title, 'Local sample', 'standard', 'published',
  '["HEAT","TALL","BLUE","WILD"]'::jsonb,
  '{"c1":{"id":"c1","words":["BLAZE","RIVER","CAVE","WOLF"]},
    "c2":{"id":"c2","words":["EMBER","PEAK","STORM","RIVER"]},
    "c3":{"id":"c3","words":["CLIFF","TOWER","OCEAN","BOULDER"]},
    "c4":{"id":"c4","words":["THUNDER","BUSH","SKY","STORM"]},
    "c5":{"id":"c5","words":["FROST","PINE","HAWK","DUNE"]},
    "c6":{"id":"c6","words":["GUST","BLAZE","TIDE","CRAG"]},
    "c7":{"id":"c7","words":["MARSH","VALE","CREST","SMOKE"]}}'::jsonb,
  '{"slotCards":["c1","c2","c3","c4"],"orientations":[0,0,0,0],"extraCards":["c5","c6","c7"]}'::jsonb
from (values (0, 'Elements'), (1, 'Elements II'), (2, 'Elements III')) as t(d, title)
on conflict (id) do nothing;
