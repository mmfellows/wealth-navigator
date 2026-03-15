const db = require('../services/database');
const bcrypt = require('bcryptjs');

async function seedData() {
  try {
    console.log('🌱 Starting data seeding...');

    // Create demo user
    const passwordHash = await bcrypt.hash('demo', 10);
    await db.run(
      'INSERT OR REPLACE INTO users (id, email, password_hash) VALUES (?, ?, ?)',
      [1, 'demo@example.com', passwordHash]
    );

    // Create default settings
    await db.run(
      'INSERT OR REPLACE INTO settings (user_id, target_low_risk, target_growth, target_speculative) VALUES (?, ?, ?, ?)',
      [1, 30, 60, 10]
    );

    // Sample investments
    const investments = [
      {
        id: 'inv-1',
        ticker: 'AAPL',
        name: 'Apple Inc.',
        shares: 50,
        purchase_price: 162.50,
        purchase_date: '2023-11-15',
        platform: 'etrade',
        category: 'growth'
      },
      {
        id: 'inv-2',
        ticker: 'MSFT',
        name: 'Microsoft Corporation',
        shares: 25,
        purchase_price: 365.20,
        purchase_date: '2023-12-01',
        platform: 'schwab',
        category: 'growth'
      },
      {
        id: 'inv-3',
        ticker: 'JNJ',
        name: 'Johnson & Johnson',
        shares: 75,
        purchase_price: 168.40,
        purchase_date: '2023-10-20',
        platform: 'chase',
        category: 'low-risk'
      },
      {
        id: 'inv-4',
        ticker: 'GOOGL',
        name: 'Alphabet Inc.',
        shares: 30,
        purchase_price: 138.90,
        purchase_date: '2024-01-05',
        platform: 'etrade',
        category: 'growth'
      },
      {
        id: 'inv-5',
        ticker: 'NVDA',
        name: 'NVIDIA Corporation',
        shares: 10,
        purchase_price: 785.00,
        purchase_date: '2024-01-10',
        platform: 'schwab',
        category: 'speculative'
      }
    ];

    for (const inv of investments) {
      await db.run(
        `INSERT OR REPLACE INTO investments
         (id, user_id, ticker, name, shares, purchase_price, purchase_date, platform, category)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [inv.id, 1, inv.ticker, inv.name, inv.shares, inv.purchase_price, inv.purchase_date, inv.platform, inv.category]
      );
    }

    // Sample trades
    const trades = [
      {
        id: 'trade-1',
        ticker: 'AAPL',
        type: 'buy',
        shares: 25,
        price: 175.43,
        date: '2024-01-22',
        platform: 'etrade',
        rationale: 'Strong Q4 earnings report showed 13% revenue growth. iPhone 15 sales exceeded expectations and services revenue continues growing at 16% YoY.'
      },
      {
        id: 'trade-2',
        ticker: 'MSFT',
        type: 'buy',
        shares: 15,
        price: 378.85,
        date: '2024-01-20',
        platform: 'schwab',
        rationale: 'Azure cloud growth continues at 28% YoY. AI integration across Office suite driving subscription growth. Trading at reasonable valuation.'
      },
      {
        id: 'trade-3',
        ticker: 'TSLA',
        type: 'sell',
        shares: 10,
        price: 248.50,
        date: '2024-01-18',
        platform: 'chase',
        rationale: 'Reduced position due to increased competition in EV space and concerns about delivery guidance for 2024.'
      },
      {
        id: 'trade-4',
        ticker: 'JNJ',
        type: 'buy',
        shares: 50,
        price: 162.87,
        date: '2024-01-15',
        platform: 'chase',
        rationale: 'Defensive play with 3.2% dividend yield. Pharmaceutical pipeline looks strong for 2024 with several drug approvals expected.'
      },
      {
        id: 'trade-5',
        ticker: 'NVDA',
        type: 'buy',
        shares: 5,
        price: 875.28,
        date: '2024-01-25',
        platform: 'schwab',
        rationale: ''  // Missing rationale to test the reminder system
      }
    ];

    for (const trade of trades) {
      await db.run(
        `INSERT OR REPLACE INTO trades
         (id, user_id, ticker, type, shares, price, date, platform, rationale)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [trade.id, 1, trade.ticker, trade.type, trade.shares, trade.price, trade.date, trade.platform, trade.rationale]
      );
    }

    // Sample investment ideas
    const ideas = [
      {
        id: 'idea-1',
        ticker: 'V',
        name: 'Visa Inc.',
        category: 'growth',
        notes: 'Dominant player in digital payments with strong moat. Benefits from ongoing shift to cashless payments globally.',
        date_added: '2024-01-12'
      },
      {
        id: 'idea-2',
        ticker: 'WMT',
        name: 'Walmart Inc.',
        category: 'low-risk',
        notes: 'Defensive consumer staples play. Strong e-commerce growth and improving margins. Good dividend yield.',
        date_added: '2024-01-10'
      },
      {
        id: 'idea-3',
        ticker: 'AMD',
        name: 'Advanced Micro Devices',
        category: 'speculative',
        notes: 'Strong position in AI chips and data center market. High growth potential but volatile stock price.',
        date_added: '2024-01-08'
      },
      {
        id: 'idea-4',
        ticker: 'PG',
        name: 'Procter & Gamble',
        category: 'low-risk',
        notes: 'Consumer staples with strong brands and pricing power. Consistent dividend aristocrat with 65+ year streak.',
        date_added: '2024-01-05'
      }
    ];

    for (const idea of ideas) {
      await db.run(
        `INSERT OR REPLACE INTO ideas
         (id, user_id, ticker, name, category, notes, date_added)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [idea.id, 1, idea.ticker, idea.name, idea.category, idea.notes, idea.date_added]
      );
    }

    // Sample research queries
    const queries = [
      {
        query: 'Best dividend stocks for retirement portfolio',
        response: 'Top dividend stocks include JNJ (3.2% yield), KO (3.1% yield), and PG (2.5% yield). Focus on dividend aristocrats with 25+ years of increases.',
        created_at: '2024-01-20 10:30:00'
      },
      {
        query: 'Technical analysis for NVDA',
        response: 'NVDA showing strong momentum with RSI at 65. Breaking above resistance at $850. Volume confirms institutional buying.',
        created_at: '2024-01-19 14:15:00'
      },
      {
        query: 'Clean energy ETFs comparison',
        response: 'ICLN and PBW are top clean energy ETFs. ICLN focuses on global clean energy, PBW on clean technology. Both high volatility.',
        created_at: '2024-01-18 09:45:00'
      }
    ];

    for (const query of queries) {
      await db.run(
        'INSERT INTO research_queries (user_id, query, response, created_at) VALUES (?, ?, ?, ?)',
        [1, query.query, query.response, query.created_at]
      );
    }

    console.log('✅ Sample data seeded successfully!');
    console.log('📊 Demo user: demo@example.com / demo');
    console.log('🔗 Frontend: http://localhost:3000');
    console.log('🚀 Backend API: http://localhost:3001');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding data:', error);
    process.exit(1);
  }
}

seedData();