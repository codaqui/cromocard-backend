#!/usr/bin/env bash
# Exige de 90% a 100% de cobertura em cada arquivo alterado em relação à branch base (ADR-060).
set -euo pipefail

base_ref="${1:?Informe a branch base. Exemplo: origin/develop}"

mapfile -t changed_files < <(
  git diff --name-only --diff-filter=AM "${base_ref}...HEAD" -- src \
    | grep -E '\.tsx?$' \
    | grep -vE '\.spec\.|\.d\.ts$|/index\.ts$|\.types\.ts$|/(server|ws-server)\.ts$|/app/(main|router)\.tsx$|^src/test/|^src/generated/' \
    || true
)

if [ "${#changed_files[@]}" -eq 0 ]; then
  echo 'Nenhum arquivo com lógica foi alterado: nada a medir.'
  exit 0
fi

echo 'Arquivos medidos:'
printf '  %s\n' "${changed_files[@]}"

include_args=()
for file in "${changed_files[@]}"; do
  include_args+=("--coverage.include=${file}")
done

npx vitest run --coverage "${include_args[@]}" \
  --coverage.thresholds.perFile \
  --coverage.thresholds.lines=90 \
  --coverage.thresholds.functions=90 \
  --coverage.thresholds.branches=90 \
  --coverage.thresholds.statements=90 \
  --coverage.reporter=text
