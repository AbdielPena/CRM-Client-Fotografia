#!/usr/bin/env python3
import sys, re

path = "/home/studioflow/htdocs/my.abbypixel.com/.next/server/app/p/[studio]/[pkg]/page.js"
src = open(path, "r", encoding="utf-8").read()

# Buscar la primera ocurrencia de: const{data:s}=await r.from("studios_public")
pat = 'const{data:s}=await r.from("studios_public")'
if pat not in src:
    print("PATRON NO ENCONTRADO; ya estaba patcheado quiza")
    sys.exit(1)

# Reemplazar para capturar todo el resultado
new = src.replace(
    pat,
    'const __r1=await r.from("studios_public")',
    1
)

# Y reemplazar el uso de s para loguear el resultado completo
pat2 = 'const n=s;'
new = new.replace(
    pat2,
    'console.error("[DBG]",JSON.stringify({data:__r1.data,error:__r1.error,status:__r1.status,count:__r1.count}));const s=__r1.data;const n=s;',
    1
)

open(path, "w", encoding="utf-8").write(new)
print("PATCHED OK")
