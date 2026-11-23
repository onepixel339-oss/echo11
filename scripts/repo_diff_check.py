#!/usr/bin/env python3
"""Compare remote GitHub tree (walked via MCP) against local git main.
Outputs: files to UPLOAD (missing or different) and files to DELETE (extra)."""

import subprocess, json, os

# Remote manifest gathered from GitHub MCP directory walk (path -> blob sha)
REMOTE = {
".env.example": "eb1a7d1515963e326683a4d9ff4dba30e43fdbc6",
".gitignore": "5fb80b84e22309dffd76a82328138e7c22a9f3e4",
"DEPLOY-AR.md": "c61e328ab71c4cbad64f2576cd79c0f1e88ce8dc",
"README.md": "fed68464b9a536ceb9bf7c37f73ef031169375c5",
"bun.lock": "a0d775e8b661312c571f519157e483355c387585",
"components.json": "ffe928f5b6dfe484f57a5fd47d0487f21e164fa3",
"docs/DATA_PROVIDER_COMPLIANCE.md": "d105d948f43b95752f023e39d0aaeefe7cdff5bf",
"eslint.config.mjs": "22875666a9f47105653e1910b1272ec0ce083c63",
"next-env.d.ts": "ce4e94a6b10f160ee021fe18939af160d2927dcf",
"next.config.ts": "88ddcf1b7b7404b3e5b2206e04048e952476664c",
"package-lock.json": "663a4386a6bf5b830c715dea2bec7a63aff97118",
"package.json": "d755dc206db669332e1faa0378b2c6b586b73f40",
"postcss.config.mjs": "c7bcb4b1ee14cd5e25078c2c934529afdd2a7df9",
"tailwind.config.ts": "fc48e48832707aaaff6bd9b8cbba76358adf2e83",
"tsconfig.json": "c071b8092699945280fb27c7a3bb5fa69b98c0f1",
"public/catalog/README.md": "ecfdc4a50aae9031cc4218de47f682c3f0aabf99",
"public/catalog/manifest.json": "756d14b2943451485eb6daf3950d0d07a22245e4",
"public/catalog/pg-classics-en.json": "416d5ee0390cc60253272b5a1048cc31f8a5102d",
"public/icons/icon-192.png": "6a9e249f9526b6bcd51e0bc5fa68db2ebd8bb27b",
"public/icons/icon-512.png": "e5f2bd019109f6e7cc31afd53d525b3bf9363fd7",
"public/icons/icon.svg": "20710b9dfb57460188483b3336fdca9636da030d",
"public/icons/maskable-512.png": "f97cf82ca8045ef4ed4e2c8582f49ec382b65cf7",
"public/logo.svg": "afdf7805c2f65906a79bfa4f8556cea392cf32ec",
"public/robots.txt": "6018e701fc7dd0317cda9eceea390524322e8a05",
"public/sw.js": "6337346d15d948eaff1665a882489abcd2d4a656",
"scripts/final-counts.ts": "54c33bae15ebdb5616f715b5a1dd85c10d4afbf1",
"scripts/generate-icons.ts": "906584fcb4aaff7480dc1586e37dba0fcc122e4a",
"scripts/live-verify.ts": "8c15d34f6fbf649aa54ca542d26fc37bf9d286bb",
"scripts/regen_icons.py": "1f0c5d19910776730e6758433d02e1e36aa33007",
"scripts/startdev.sh": "6ab0519dd915b67233505e65369995ee4a30ceaf",
"scripts/test-arabic-and-cache.ts": "4edfd187de490ffd9c8358c2c048a26060a20f14",
"scripts/test-ask.ts": "45efa417c61b484b8318c89cf7ee990ba34afd70",
"scripts/test-coming-soon.ts": "44249f649762b5910fefcdd461f2e6d9815e47ee",
"scripts/test-companion.ts": "d9546633cfbcca4645b09d02a738307f0a5b8b04",
"scripts/test-expanded-providers.ts": "8ce2f686a246e3c7a98aeeb73e30a60fef1eb07a",
"scripts/test-imdb-map.mts": "66363f4b99482f813c709e5dfb83a12cd4cd2738",
"scripts/test-trailer.ts": "2df5debeee0b5baafffa5ba0f76e5693b8ecd4ac",
"scripts/test-translate-route.ts": "daf489612a4716c7b6cee40a456c354bc1f273c6",
"scripts/test-translate.ts": "1de7229993de13939f3e17a48930719c5698b434",
"scripts/test-vocab-coverage.ts": "da4bce81d76a27b293d684fda617f59c0abbb53d",
"scripts/test_live.sh": "8be9ab5172400ab63214413e1b81ed3a368bae17",
"scripts/test_pollinations.sh": "d9058adfcd7139df117212dba788b3bd9b57e2b5",
"scripts/wait_deploy.sh": "cabe1fb6b472b89ca58f75b56f5c331e72b21ef7",
"src/app/api/echo/ai/ask/route.ts": "6d1083a12508814c76edc6808d311fa0f94f4823",
"src/app/api/echo/ai/companion/route.ts": "d2d5e9048b7f4d7cff7425a8328f34532fad39ad",
"src/app/api/echo/ai/weekly/route.ts": "38f63841cc4a1e03424c22ef9e1a07c065273e9f",
"src/app/api/echo/translate/route.ts": "0d1c1af1b9d63f5d35782fd64d3a25321f9a3a23",
"src/app/fonts/alexandria-arabic-var.woff2": "fa9c5945d196ed902c6eefb688445a4d81da03b3",
"src/app/fonts/alexandria-latin-var.woff2": "47366b296862b786858d711d732e400de8c65706",
"src/app/fonts/space-grotesk-var.woff2": "0f3474ee8af2f8253225f3b41bf79be986a1ae13",
"src/app/globals.css": "55bf376d0f6642a7a8859f2a2cf0711f1dae9699",
"src/app/layout.tsx": "05490bde3527e86b5076607275c95cd300cf40e5",
"src/app/manifest.ts": "d7511020630bd6170f1089a167b4c2520b386452",
"src/app/page.tsx": "a82a662557d8c2ea16bd36f5be37c4ca04a43ba7",
"src/components/echo/AddTitleDialog.tsx": "e2ea7e2d166d27b3dc42d93f3bac324c82381ef0",
"src/components/echo/AppShell.tsx": "48c24f9faba910a81ab1d8b7b19bee084ba6895a",
"src/components/echo/DetailsDrawer.tsx": "5a94be0b4bc23e1edad2b19fc766a2afe18cc7dd",
"src/components/echo/EchoApp.tsx": "46e4535605d180c8e890aa38810ae756d84964df",
"src/components/echo/EchoLogo.tsx": "84bad3b8f1fe22382398a3ac2859087670837761",
"src/components/echo/MapCanvas.tsx": "f68315c49d58750b8108aa32d29dd58efa72ec45",
"src/components/echo/OnboardingFlow.tsx": "81ffdc0833aedcab52c9c38a0ec8c9666e2a4365",
"src/components/echo/TasteCardDialog.tsx": "b6cfacfcae2d70d450e6b994ce3f0701bc9d12bb",
"src/components/echo/bits.tsx": "fa05993a7e6b9056c6bfe0aa2ef9a351eb147ecd",
"src/components/echo/useSynopsisTranslation.ts": "2840beb9fe171f98143e3efaa13b216302693f21",
"src/components/echo/screens/AskScreen.tsx": "a2f05098961ee56ed5fe6f85d963919105cc9339",
"src/components/echo/screens/DiscoverScreen.tsx": "6d1e1094aae3a6fd016fe9a83570df77788438b9",
"src/components/echo/screens/LibraryScreen.tsx": "2de6ddf6f63c59cf9fdf5cfc9a034c1c677246b3",
"src/components/echo/screens/MapScreen.tsx": "750a6de2bd3b4f790a1dc5c8260b6f97f3a100a1",
"src/components/echo/screens/SettingsScreen.tsx": "686f832e086456600adf6d7fee52521622f10adc",
"src/components/echo/screens/TasteScreen.tsx": "bcd5f58d00c6342626963d081dcace428d4934c4",
"src/components/ui/alert-dialog.tsx": "0863e40d92fe36ed1dd34d3a555f4947eff03af4",
"src/components/ui/badge.tsx": "02054139a9a72f2ce2c4defd14861b4129312950",
"src/components/ui/button.tsx": "a2df8dce675fed0712d021fa45245289ecd26c88",
"src/components/ui/dialog.tsx": "d9ccec91d22fab844bd04340c2b07e8677955350",
"src/components/ui/input.tsx": "03295ca6ac617de95b78b09e5e3a6de897a204f0",
"src/components/ui/label.tsx": "fb5fbc3eee891a5c118bb00fd153273c16959c9e",
"src/components/ui/popover.tsx": "01e468b6783992d04775aa52376221b8fa4b0f95",
"src/components/ui/select.tsx": "dcbbc0ca0c781dfa6d2fe4ee6f1c9c2cad905a9b",
"src/components/ui/separator.tsx": "275381cab0adbc778ea634e7c46fbf80db821bf3",
"src/components/ui/sheet.tsx": "84649ad0ffd80bdd74dac8bcced074cf63e43233",
"src/components/ui/skeleton.tsx": "32ea0ef7fb4d4f7cb0affa7a3b329533b5f2af23",
"src/components/ui/slider.tsx": "09391e86b31eb47649e419a28b6ccf20e80aa4ef",
"src/components/ui/switch.tsx": "6a2b5241d8c0b3df98dec769e9999df4978975bf",
"src/components/ui/textarea.tsx": "7f21b5e78a4c1c23bf41b6be206f3f81dc84fe99",
"src/components/ui/toast.tsx": "2d96b40eb11bd1eb26b659404f69e73a02fcfe78",
"src/components/ui/toaster.tsx": "3f3c878962026b2912d1e3df67c3859fccaa6ad7",
"src/components/ui/toggle.tsx": "94ec8f58b345a8c33b165463dfda393c7255967",
"src/components/ui/tooltip.tsx": "4ee26b38a595862a5a082013d564d1ccf8452a7c",
"src/hooks/use-mobile.ts": "2b0fe1dfef3b17850bbac040665f514a8ffd0f15",
"src/hooks/use-toast.ts": "b559959226c5b17b8a719d29a2cafe1ff5f935ef",
"src/lib/utils.ts": "bd0c391ddd1088e9067844c48835bf4abcd61783",
"src/lib/echo/ai/ask.ts": "511752cbbf912b99ffda49eda95228ce1d0536c0",
"src/lib/echo/ai/companion.ts": "20da5175f1d16e4d06195d54221b506948d1a0bd",
"src/lib/echo/ai/llm.ts": "1c48aaf036690f4c3ea792185e486c92d012c363",
"src/lib/echo/ai/weekly.ts": "dadd1f5f92d9697957a029760f9e49394eb31df3",
"src/lib/echo/data/demoCatalogue.ts": "efbbfe505936e8c16de3a458f6d9fc0114970e6a",
"src/lib/echo/data/vocab.ts": "eec29416e4bac11b2cb24fd94ffb716ffcb35556",
"src/lib/echo/engine/cluster.ts": "cb57683604ce62203e1e24081e53128f78b1f65f",
"src/lib/echo/engine/features.ts": "63fe1d08651660836b6a63b79c22069f89a2233d",
"src/lib/echo/engine/identityCard.ts": "fe39ee0da2aceeac1fa70a07aa0499f7f51d009f",
"src/lib/echo/engine/layout.ts": "38b918410caa9e0a44f203a8ec6c03417fac3cca",
"src/lib/echo/engine/recommend.ts": "af180abf1588b5de80cebedd710e3b6a2e15cbe0",
"src/lib/echo/engine/similarity.ts": "001625fd006c83665336fcbff13c53bda57d99e6",
"src/lib/echo/engine/taste.ts": "588482504670f77acbeeaa1eddebd19330becf64",
"src/lib/echo/exportimport.ts": "e51fa7cf1382825a9e0eef09c78f0ed42720983f",
"src/lib/echo/i18n.tsx": "3eb35a4e5024130a835c36aa1b40af8f21889fab",
"src/lib/echo/ids.ts": "83a14808de88d2125227c7b21204c52b0d9d8f21",
"src/lib/echo/localdb.ts": "2683fc07cfcfc43e8134d32bd81d850e8aae3128",
"src/lib/echo/localdbHelpers.ts": "4de051992ff4da73d86a6aaf0cb39d299722d565",
"src/lib/echo/poster.ts": "cd609d91bc4556d6427cbb544ee74bd12aca6fcc",
"src/lib/echo/providers/anilist.ts": "997711ce3591e872a3c616038d66e52c97d28af4",
"src/lib/echo/providers/cache.ts": "c4f3a756bc1c78cafa41fbbe7e5427f30e3c078c",
"src/lib/echo/providers/demo.ts": "71b0cd2cf75d97ed76a3a85c780236d59606dcd2",
"src/lib/echo/providers/imdb.ts": "540dc9a1b92d114cc9f6efa71b2439ba73d9c787",
"src/lib/echo/providers/index.ts": "cea2d2b9e040493ec886a7b105424920b5f8f6b0",
"src/lib/echo/providers/kitsu.ts": "19910417a5bf43dbd6b1cd376ba75f7f983f11f3",
"src/lib/echo/providers/match.ts": "684779b4b9d17a0b99ae827acfc32a5e64664675",
"src/lib/echo/providers/openlibrary.ts": "725fa88d67aad620d17bc68cf9cd2a78cfb37f54",
"src/lib/echo/providers/rawg.ts": "8fd414b035557418e270dea9448df0f0016eb7c1",
"src/lib/echo/providers/registry.ts": "9703e2610c53185e2d5cd7421ebd4d45eb2edefd",
"src/lib/echo/providers/tvmaze.ts": "9a65b23dc978a74f61548dedc44025d1baee9605",
"src/lib/echo/providers/types.ts": "8e7fcb4876028b8237903f0ea2d479e644eb6c2a",
"src/lib/echo/server/kv.ts": "a6af6e163fe73311a9716303793497b3ecb6931b",
"src/lib/echo/server/ratelimit.ts": "1301ff07161e1f443706cd021d3ef667239207e3",
"src/lib/echo/server/translate.ts": "a1a139f0499e41dc5c19d960fa415bf240a1c62b",
"src/lib/echo/store.ts": "e31623c2e648e5857117a6b185e1f26b42b516a0",
"src/lib/echo/types.ts": "7cbd76eea8fe680660d0d52d3a6f60606d765854",
"src/lib/echo/__tests__/engine.test.ts": "cb9568cfee0364da3a819f45287ef88b97711366",
"src/lib/echo/__tests__/match.test.ts": "bf9ad435553425ae9ffd4a76384c6e82a97297cc",
"src/lib/echo/__tests__/weekly.test.ts": "0f40b73cf67c8284b4586562024fd4c2c823cac0",
}

# Old-root directories on remote that must be deleted entirely (plus extras)
DELETE_DIRS = ["app/", "components/", "hooks/", "lib/"]
DELETE_FILES = ["package-lock.json", "DEPLOY-AR.md", "next-env.d.ts"]

def local_manifest():
    out = subprocess.run(["git", "ls-files", "-s"], capture_output=True, text=True, cwd="/home/z/my-project").stdout
    m = {}
    for line in out.strip().splitlines():
        parts = line.split()
        sha, path = parts[1], parts[3]
        m[path] = sha
    return m

local = local_manifest()

# Classify remote files
upload_missing, upload_diff, same, remote_only_src = [], [], [], []
for path, rsha in REMOTE.items():
    if any(path.startswith(d) for d in DELETE_DIRS) or path in DELETE_FILES:
        continue  # covered by delete lists
    lsha = local.get(path)
    if lsha is None:
        remote_only_src.append(path)
    elif lsha != rsha:
        upload_diff.append(path)
    else:
        same.append(path)

# Files in local but not on remote at all
local_missing = [p for p in local if p not in REMOTE]

print("=== IDENTICAL (no action):", len(same), "files ===")
print()
print("=== DIFFERENT CONTENT — must re-upload:", len(upload_diff), "===")
for p in sorted(upload_diff): print("  ~", p)
print()
print("=== MISSING ON REMOTE — must upload:", len(local_missing), "===")
for p in sorted(local_missing): print("  +", p)
print()
print("=== PRESENT ON REMOTE BUT NOT IN LOCAL FINAL (delete):", len(remote_only_src), "===")
for p in sorted(remote_only_src): print("  -", p)
print()
print("=== OLD-STRUCTURE DELETIONS (whole dirs) ===")
for d in DELETE_DIRS: print("  -", d, "(entire directory)")
for f in DELETE_FILES: print("  -", f)

# Save machine-readable result
result = {
    "upload": sorted(upload_diff + local_missing),
    "delete_files": sorted(remote_only_src + DELETE_FILES),
    "delete_dirs": DELETE_DIRS,
    "same_count": len(same),
}
with open("/tmp/repo_diff.json", "w") as f:
    json.dump(result, f, indent=1)
print()
print("Saved /tmp/repo_diff.json | upload:", len(result["upload"]), "files | delete files:", len(result["delete_files"]))
