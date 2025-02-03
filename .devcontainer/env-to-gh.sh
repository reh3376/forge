#!/bin/bash

while IFS='=' read -r key value
do
  # Ignore comments and empty lines
  if [[ ! $key =~ ^#.*$ ]] && [ ! -z "$key" ]; then
    # Remove any surrounding quotes from the value
    value=$(echo $value | sed -e 's/^"//' -e 's/"$//')
    echo "gh secret set $key -b\"$value\" -a codespaces"
  fi
done < ../apps/whk-recipe-configuration/.env