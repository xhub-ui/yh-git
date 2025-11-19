
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateReadme = async (repoName: string, description: string, fileStructure: string[]): Promise<string> => {
  try {
    const model = 'gemini-2.5-flash';
    const prompt = `
      Create a professional README.md for a GitHub repository.
      Repo Name: ${repoName}
      Description: ${description}
      
      Known Files:
      ${fileStructure.slice(0, 20).join('\n')}
      
      Includes:
      - Project Title
      - Description
      - Installation/Usage (make generic assumptions based on file types e.g. .js = node, .py = python)
      - Contributing
      - License
      
      Output ONLY the markdown content.
    `;

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
    });

    return response.text || "# README Generation Failed";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "# README\n\nGenerated automatically. (AI Service Unavailable)";
  }
};

export const analyzeFileForCommit = async (fileName: string, contentSnippet: string): Promise<string> => {
  try {
    const model = 'gemini-2.5-flash';
    const prompt = `
      Generate a concise, conventional commit message for adding/updating this file.
      File: ${fileName}
      Content Preview: "${contentSnippet.substring(0, 200)}..."
      
      Format: <type>(<scope>): <subject>
      Example: feat(core): add initial logic for login
      
      Return ONLY the commit message string.
    `;

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
    });

    return (response.text || `Update ${fileName}`).trim();
  } catch (error) {
    return `Update ${fileName}`;
  }
};

export const explainCode = async (fileName: string, code: string): Promise<string> => {
  try {
    const model = 'gemini-2.5-flash';
    const prompt = `
      You are an expert senior software engineer. Explain the following code file.
      
      Filename: ${fileName}
      
      Code Snippet:
      ${code.substring(0, 5000)}
      
      Provide a response in the following structure:
      1. **Summary**: A 1-2 sentence overview.
      2. **Key Features**: Bullet points of what the code does.
      3. **Potential Improvements**: If any bugs or bad practices are spotted.
      
      Keep the tone professional and helpful.
    `;

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
    });

    return response.text || "Could not generate explanation.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Failed to generate AI explanation. Check API Key.";
  }
};
