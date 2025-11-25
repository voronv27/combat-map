# combat-map
Interactive DnD combat map site

Link to site: https://combat-map--main.voronv27.deno.net/

# HOW TO RUN LOCALLY:
Setup:
* Install Deno: https://docs.deno.com/runtime/getting_started/installation/  
* Clone this repository 
* Get a Supabase account (https://supabase.com/). You'll want to create a project, then go to Storage and create an "images" bucket in your Supabase project. You can get a URL from "Settings->Data API" and the key from "Settings->API Keys".
* Create a .env file with a SUPABASE_URL variable that contains your Supabase URL and SUPABASE_SERVICE_KEY variable with your API key.  
EXAMPLE .env FILE format:  
SUPABASE_URL=your-url  
SUPABASE_SERVICE_KEY=your-service-role-key  

Steps to run:
* In the command line, navigate to the combat-map/server directory  
* From this directory run the command "deno run dev" to host the server  
* You should be able to access the site from localhost:8080 on the computer hosting the server  
* To update the local server with code changes, stop the server (Ctrl+C in the command line) and re-run "deno run dev"
