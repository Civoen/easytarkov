const TASKS = [
  { name: 'Debut', trader: 'Prapor', level: 1, url: 'debut.html' },
  { name: 'Delivery From the Past', trader: 'Prapor', level: 5, url: 'delivery_from_the_past.html' },
  { name: 'Farming - Part 1', trader: 'Mechanic', level: 12, url: 'farming_part_1.html', chain: 'farming', chainOrder: 1 },
  { name: 'Farming - Part 2', trader: 'Mechanic', level: 12, url: 'farming_part_2.html', chain: 'farming', chainOrder: 2 },
  { name: 'Farming - Part 3', trader: 'Mechanic', level: 14, url: 'farming_part_3.html', chain: 'farming', chainOrder: 3 },
  { name: 'Farming - Part 4', trader: 'Mechanic', level: 14, url: 'farming_part_4.html', chain: 'farming', chainOrder: 4 },
  { name: 'A Shooter Born in Heaven', trader: 'Mechanic', level: 14, url: 'a_shooter_born_in_heaven.html' },
  { name: 'Return the Favor', trader: 'Lightkeeper', level: 33, url: 'return_the_favor.html' },
  { name: 'First in Line', trader: 'Therapist', level: 1, url: 'first_in_line.html' },
  { name: 'Chemical - Part 1', trader: 'Skier', level: 10, url: 'chemical_part_1.html' },
  { name: 'Fishing Gear', trader: 'Peacekeeper', level: 10, url: 'fishing_gear.html' },
  { name: 'Database - Part 1', trader: 'Ragman', level: 17, url: 'database_part_1.html' },
  { name: 'The Tarkov Shooter - Part 1', trader: 'Jaeger', level: 2, url: 'tarkov_shooter_part_1.html' },
  { name: 'Collector', trader: 'Fence', level: 45, url: 'collector.html' }
];

const TASK_DETAILS = {
  'debut.html': {
    location: 'Any location',
    items: [
      'MP-133 12ga shotgun \u00d7 2 \u2014 handover only, not found in raid;',
      '5 Scav eliminations, any map'
    ]
  },
  'delivery_from_the_past.html': {
    location: 'Customs, Factory',
    items: [
      "Tarcone Director's office key \u2014 needed to enter, not consumed",
      'Secure folder / documents case \u2014 quest item, lost on death'
    ]
  },
  'farming_part_1.html': {
    location: 'Factory',
    items: [
      'Toolset \u00d7 2 \u2014 consumed on use, not found in raid'
    ]
  },
  'farming_part_2.html': {
    location: 'Any location',
    items: [
      'Power cord \u00d7 2 \u2014 found in raid;',
      'T-Shaped Plug \u00d7 4 \u2014 found in raid;',
      'Printed circuit board \u00d7 2 \u2014 found in raid'
    ]
  },
  'farming_part_3.html': {
    location: 'Customs',
    items: [
      'Customs office key \u2014 needed to enter, not consumed;',
      'Package with graphics cards \u2014 found in raid, quest item'
    ]
  },
  'farming_part_4.html': {
    location: 'Any location',
    items: [
      'Graphics card \u00d7 3 \u2014 found in raid;',
      'CPU fan \u00d7 15 \u2014 found in raid'
    ]
  },
  'a_shooter_born_in_heaven.html': {
    location: 'Woods, Reserve, Shoreline, Customs, Lighthouse, Streets of Tarkov, Interchange, Ground Zero',
    items: [
      'Bolt-action rifle \u2014 not consumed;',
      '5 PMC headshots required on each of the 8 maps'
    ]
  },
  'return_the_favor.html': {
    location: 'Woods',
    items: [
      'TerraGroup "Blue Folders" materials \u00d7 2 \u2014 found in raid;',
      '15 PMC eliminations required first'
    ]
  },
  'first_in_line.html': {
    location: 'Ground Zero',
    items: [
      'Any medical items \u00d7 3 \u2014 found in raid;',
      'Locate the Emercom checkpoint'
    ]
  },
  'chemical_part_1.html': {
    location: 'Customs',
    items: [
      'Dorm room 220 key \u2014 handover, not consumed;',
      'Secure folder \u2014 found in raid, quest item'
    ]
  },
  'fishing_gear.html': {
    location: 'Shoreline',
    items: [
      'SV-98 sniper rifle \u2014 sent via mail, stash in boat;',
      'Leatherman Multitool \u2014 sent via mail, stash in boat'
    ]
  },
  'database_part_1.html': {
    location: 'Interchange',
    items: [
      'Goshan cargo manifests \u2014 found in raid, quest item'
    ]
  },
  'tarkov_shooter_part_1.html': {
    location: 'Any location',
    items: [
      'Bolt-action rifle, iron sights \u2014 not consumed;',
      '5 Scav eliminations from 40m+'
    ]
  },
  'collector.html': {
    location: 'Any location',
    items: [
      '39 unique streamer items \u2014 all found in raid;',
      'See the Kappa page for the full checklist'
    ]
  }
};

const TRADERS = [
  { name: 'Prapor', url: 'prapor.html' },
  { name: 'Therapist', url: 'therapist.html' },
  { name: 'Skier', url: 'skier.html' },
  { name: 'Peacekeeper', url: 'peacekeeper.html' },
  { name: 'Mechanic', url: 'mechanic.html' },
  { name: 'Ragman', url: 'ragman.html' },
  { name: 'Jaeger', url: 'jaeger.html' },
  { name: 'Fence', url: 'fence.html' },
  { name: 'Lightkeeper', url: 'lightkeeper.html' }
];

const KAPPA_ITEMS = [
  '42 Signature Blend English Tea', 'Antique axe', 'Armband (Evasion)',
  'Axel parrot figurine', "Baddie's red beard", 'BakeEzy cook book',
  'Battered antique book', 'BEAR Buddy plush toy',
  "Can of Dr. Lupo's coffee beans", 'Can of RatCola soda', 'Can of sprats',
  "Deadlyslob's beard oil", 'DRD body armor', 'Fake mustache',
  'FireKlean gun lube', 'Gingy keychain', 'Glorious E lightweight armored mask',
  'Golden 1GPhone smartphone', 'Golden egg', 'Golden rooster figurine',
  'Inseq gas pipe wrench', 'Jar of DevilDog mayo', 'JohnB Liquid DNB glasses',
  'Kotton beanie', 'Loot Lord plushie', "LVNDMARK's rat poison",
  'Missam forklift key', 'Old firesteel', 'Pestily plague mask',
  'Press pass (issued for NoiceGuy)', 'Raven figurine', 'Shroud half-mask',
  'Silver Badge', 'Smoke balaclava', 'Tamatthi kunai knife replica',
  'Veritas guitar pick', 'Video cassette with the Cyborg Killer movie',
  'Viibiin sneaker', 'WZ Wallet'
];
