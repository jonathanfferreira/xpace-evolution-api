
import fs from 'fs';
import path from 'path';

const envPath = path.resolve(__dirname, '../../.env');

try {
    const content = fs.readFileSync(envPath);
    let text = '';

    // Detect UTF-16 LE BOM
    if (content.length >= 2 && content[0] === 0xFF && content[1] === 0xFE) {
        text = content.toString('utf16le');
        console.log('Detected UTF-16 LE encoding.');
    } else {
        text = content.toString('utf8');
        console.log('Detected UTF-8 (or ASCII) encoding.');
    }

    console.log('Original Content Length:', text.length);

    // Clean up null bytes if any (common in mixed encoding)
    text = text.replace(/\0/g, '');

    const uri = 'postgresql://postgres:Jff%2356628426@db.zpyhvfpfeljkzgchhhiu.supabase.co:5432/postgres';

    // Check if URI exists
    if (!text.includes('DATABASE_CONNECTION_URI')) {
        console.log('DATABASE_CONNECTION_URI not found. Appending...');
        text += `\nDATABASE_CONNECTION_URI=${uri}\n`;
    } else {
        console.log('DATABASE_CONNECTION_URI already exists. Ensuring it is correct...');
        // Optional: Replace it if strictly needed, but appending might create duplicates. 
        // For now, let's assume if it exists it might be the broken one from previous echo?
        // Let's replace the line if it exists.
        const lines = text.split('\n');
        const newLines = lines.filter(l => !l.startsWith('DATABASE_CONNECTION_URI'));
        newLines.push(`DATABASE_CONNECTION_URI=${uri}`);
        text = newLines.join('\n');
    }

    // Write back as UTF-8
    fs.writeFileSync(envPath, text, 'utf8');
    console.log('✅ .env fixed and saved as UTF-8!');

} catch (error) {
    console.error('Error fixing .env:', error);
}
