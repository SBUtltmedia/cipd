import { execSync } from 'child_process';

let herokuInstances = 1;

let commands = [
    `git add .`,
    `git commit -m "Automated update to Heroku/Github"`
]

for (let i = 1; i <= herokuInstances; i++) {
    commands.push(`git push -f https://git.heroku.com/cipd-${i}.git HEAD:master`);

    for (let command of commands) {
        try {
            execSync(command, console.log);
        } catch(err) {}
        // console.log(commands);
    }
    commands = [];
}