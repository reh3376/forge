   #!/bin/bash

   # Install dependencies and build the project
   echo "Installing dependencies..."
   npm install
   if [ $? -ne 0 ]; then
     echo "npm install failed!"
     exit 1
   fi

   echo "Building the project..."
   npm run build
   if [ $? -ne 0 ]; then
     echo "npm run build failed!"
     exit 1
   fi

   # Extract PM2 process IDs for 'whk-mes-backend'
   echo "Fetching PM2 process IDs for 'whk-mes-backend'..."
   INSTANCES=$(pm2 list --no-color | grep whk-mes-backend | awk '{print $2}')

   # Debug: Display the extracted instances
   echo "Extracted Instances: $INSTANCES"

   if [ -z "$INSTANCES" ]; then
     echo "No matching PM2 instances found for 'whk-mes-backend'."
     exit 1
   fi

   echo "Found instances: $INSTANCES"

   # Reload each instance individually with a delay
   for id in $INSTANCES; do
     echo "Reloading process ID $id (whk-mes-backend)..."
     pm2 reload "$id" #--env production
     if [ $? -eq 0 ]; then
       echo "Successfully reloaded process ID $id."
     else
       echo "Failed to reload process ID $id."
     fi
     echo "Waiting for 60 seconds before next reload..."
     sleep 60 # Adjust delay as needed
   done

   echo "All instances reloaded successfully."