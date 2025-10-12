import {execSync} from 'child_process';

export function isLocalBehindRemote() {
	try {
		// Ensure we have up-to-date info from the remote
		execSync('git fetch', {stdio: 'ignore'});

		// Get ahead/behind info for current branch
		const output = execSync('git rev-list --left-right --count HEAD...@{u}')
			.toString()
			.trim();

		const [behind, ahead] = output.split('\t').map(Number);

		if (behind > 0) {
			console.log(`⚠️ Local branch is ${behind} commit(s) behind remote.`);
			return true;
		} else {
			console.log('✅ Local branch is up to date with remote.');
			return false;
		}
	} catch (err) {
		console.error('Error checking remote status:', err.message);
		return null;
	}
}

isLocalBehindRemote();
