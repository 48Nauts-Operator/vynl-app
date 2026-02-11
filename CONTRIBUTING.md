# Contributing to Vynl

Thank you for your interest in contributing to Vynl! We're building a self-hosted music streaming platform with AI-powered discovery, and we'd love your help.

## How to Contribute

### Reporting Issues

Found a bug or have a feature request?

1. Check if the issue already exists in [GitHub Issues](https://github.com/48Nauts-Operator/vynl-app/issues)
2. If not, create a new issue with:
   - Clear description of the problem or feature
   - Steps to reproduce (for bugs)
   - Expected vs actual behavior
   - Your environment (OS, Docker version, etc.)
   - Screenshots or logs if relevant

### Submitting Changes

1. **Fork the repository**

2. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Make your changes**
   - Follow the existing code style
   - Test your changes locally
   - Update documentation if needed

4. **Commit with clear messages**
   ```bash
   git commit -m "feat: Add new feature description"
   ```
   
   Use conventional commit prefixes:
   - `feat:` - New features
   - `fix:` - Bug fixes
   - `docs:` - Documentation changes
   - `style:` - Code style changes (formatting, etc.)
   - `refactor:` - Code refactoring
   - `test:` - Adding or updating tests
   - `chore:` - Maintenance tasks

5. **Push to your fork**
   ```bash
   git push origin feature/your-feature-name
   ```

6. **Open a Pull Request**
   - Describe what changed and why
   - Reference any related issues
   - Wait for review

## Development Setup

### Prerequisites
- Docker and Docker Compose (recommended)
- OR Node.js 18+ and PostgreSQL 14+

### Quick Start (Docker)

```bash
# Clone your fork
git clone https://github.com/YOUR-USERNAME/vynl-app.git
cd vynl-app

# Copy environment file
cp .env.example .env

# Edit .env with your settings
# At minimum, set:
# - DATABASE_URL
# - ANTHROPIC_API_KEY (for AI features)

# Start with Docker
docker-compose up -d

# View logs
docker-compose logs -f
```

Open [http://localhost:3101](http://localhost:3101) to see the app.

### Native Development

```bash
# Install dependencies
npm install

# Set up database
npm run db:push

# Run development server
npm run dev
```

## Project Structure

```
src/
├── app/              # Next.js app router pages
├── components/       # React components
├── lib/              # Utilities and helpers
├── server/           # Backend logic
│   ├── api/         # API routes
│   ├── db/          # Database schema and queries
│   └── services/    # Business logic
└── types/           # TypeScript types
```

## Code Style

- Use TypeScript for all new code
- Follow existing naming conventions
- Use Tailwind CSS for styling
- Keep components small and focused
- Add JSDoc comments for complex functions
- Use meaningful variable names

## Testing

Before submitting:
- [ ] Test locally with `npm run dev` or Docker
- [ ] Build succeeds with `npm run build`
- [ ] No TypeScript errors (`npm run type-check`)
- [ ] No linting errors (`npm run lint`)
- [ ] Database migrations work (`npm run db:push`)
- [ ] No console errors in browser
- [ ] Responsive design works (mobile, tablet, desktop)

## Feature Guidelines

### AI Discovery
- Keep prompts cost-efficient
- Add fallbacks for API failures
- Test with various music libraries

### Sonos Integration
- Test with real Sonos speakers when possible
- Handle network errors gracefully
- Respect user privacy (local-only by default)

### Karaoke Mode
- Ensure lyrics sync properly
- Handle missing lyrics gracefully
- Test on large screens (TV mode)

## Questions?

- Open a [GitHub Discussion](https://github.com/48Nauts-Operator/vynl-app/discussions)
- Reach out to [@andrewolke on Twitter](https://twitter.com/andrewolke)
- Check existing documentation in `/docs`

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

**Thank you for helping make Vynl better!** 🎧
